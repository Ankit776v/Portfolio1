const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const defaultMongoose = require("mongoose");
const path = require("node:path");
const crypto = require("node:crypto");
const { installSecurity, errorHandler, setSession, passwordIsValid } = require("./security");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function createApp({ database = defaultMongoose, env = process.env, logger = console, fetchRemote, allowedOrigins = [] } = {}) {
  const mongoose = database;
  const app = express();
  const jwtSecret = env.JWT_SECRET;
  const resetJwtSecret = `${jwtSecret}:password-reset`;
  const clientOrigin = env.CLIENT_ORIGIN || "http://localhost:5173";
  const clientBase = `${clientOrigin}${env.MOVIESHUB_BASE_PATH || ""}`;
  const clientDistPath = path.resolve(__dirname, "../client/dist");
  const googleClientId = env.GOOGLE_CLIENT_ID;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET;
  const googleRedirectUri = env.GOOGLE_REDIRECT_URI || `${clientBase}/api/auth/google/callback`;
  const emailFrom = env.EMAIL_FROM;
  const resendApiKey = env.RESEND_API_KEY;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET must be set in the server environment.");
  }

  const trustedOrigins = new Set([clientOrigin, ...allowedOrigins]);
  app.use(cors({ origin: (origin, done) => done(null, !origin || trustedOrigins.has(origin)), credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  installSecurity(app, { clientOrigin, allowedOrigins, logger });
  app.get("/api/health", (req,res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? "ok" : "unavailable", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

  const userSchema = new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      dateOfBirth: { type: Date },
      passwordHash: { type: String },
      googleId: { type: String, unique: true, sparse: true },
      resetPasswordVersion: { type: Number, default: 0 },
      account: { type: mongoose.Schema.Types.Mixed },
    },
    { timestamps: true, optimisticConcurrency: true }
  );

  const User = mongoose.model("User", userSchema);

  const reviewSchema = new mongoose.Schema(
    {
      movieId: { type: String, required: true, trim: true, maxlength: 240, index: true },
      movieTitle: { type: String, trim: true, maxlength: 240, default: "" },
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      rating: { type: Number, required: true, min: 1, max: 5 },
      text: { type: String, required: true, trim: true, minlength: 150, maxlength: 1500 },
    },
    { timestamps: true }
  );
  reviewSchema.index({ movieId: 1, createdAt: -1, _id: -1 });
  reviewSchema.index({ user: 1, createdAt: -1, _id: -1 });
  reviewSchema.index({ movieId: 1, rating: -1, createdAt: -1, _id: -1 });
  const Review = mongoose.model("Review", reviewSchema);

  const { createToken, serializeUser, requireAuth } = require("./accounts")(app, { User, Review, mongoose, jwtSecret });
  const catalogue = require("./catalogue")(app, { mongoose, requireAuth, ...(fetchRemote ? { fetchRemote } : {}) });
  const { Report } = require("./reviews")(app, { Review, mongoose, requireAuth });
  require("./tmdb-proxy")(app, { ...(fetchRemote ? { fetchRemote } : {}) });
  async function authenticate(res, user, status = 200) { const token = await createToken(user); setSession(res, token); return res.status(status).json({ user: serializeUser(user) }); }

  function googleIsConfigured() {
    return Boolean(googleClientId && googleClientSecret);
  }

  async function sendResetEmail(to, resetUrl) {
    if (!resendApiKey || !emailFrom) return false;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [to],
        subject: "Reset your Movieshub password",
        html: `<p>Use the link below to reset your Movieshub password. It expires in 15 minutes.</p><p><a href="${resetUrl}">Reset password</a></p>`,
      }),
    });

    if (!response.ok) throw new Error("Password-reset email could not be sent.");
    return true;
  }

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password, dateOfBirth } = req.body;
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (typeof name !== "string" || !name.trim() || name.length > 80 || !normalizedEmail || normalizedEmail.length > 254 || !password) {
        return res.status(400).json({ message: "Name, email, and password are required." });
      }
      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      if (!passwordIsValid(password)) {
        return res.status(400).json({ message: "Password must contain at least 10 characters and at most 72 UTF-8 bytes." });
      }
      if (dateOfBirth !== undefined && dateOfBirth !== "" && (typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(Date.parse(dateOfBirth)) || new Date(dateOfBirth).toISOString().slice(0,10) !== dateOfBirth || new Date(dateOfBirth) > new Date())) return res.status(400).json({ message: "Enter a valid date of birth." });
      if (await User.exists({ email: normalizedEmail })) {
        return res.status(409).json({ message: "An account with that email already exists." });
      }

      const user = await User.create({
        name,
        email: normalizedEmail,
        dateOfBirth: dateOfBirth || undefined,
        passwordHash: await bcrypt.hash(password, 12),
      });
      await authenticate(res, user, 201);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 128) return res.status(400).json({ message: "Enter a valid email and password." });
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user || !user.passwordHash || typeof password !== "string" || password.length > 128 || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ message: "Invalid email or password." });
      }
      await authenticate(res, user);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/google", (req, res) => {
    if (!googleIsConfigured()) {
      return res.status(503).json({ message: "Google sign-in has not been configured yet." });
    }

    const state = jwt.sign({ type: "google-oauth", nonce: crypto.randomUUID() }, resetJwtSecret, { expiresIn: "10m" });
    res.cookie("google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: googleRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const loginUrl = new URL(`${env.MOVIESHUB_BASE_PATH || ""}/login`, clientOrigin);
    try {
      const state = req.query.state;
      const statePayload = jwt.verify(state, resetJwtSecret);
      if (statePayload.type !== "google-oauth" || state !== req.cookies.google_oauth_state || !req.query.code) {
        throw new Error("Invalid Google sign-in request.");
      }
      res.clearCookie("google_oauth_state");

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: googleRedirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.access_token) throw new Error("Google token exchange failed.");

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileResponse.json();
      if (!profileResponse.ok || !profile.sub || !profile.email || !profile.email_verified) {
        throw new Error("Google did not provide a verified email address.");
      }

      const email = profile.email.trim().toLowerCase();
      let user = await User.findOne({ googleId: profile.sub });
      if (!user) {
        user = await User.findOne({ email });
        if (user) {
          user.googleId = profile.sub;
          await user.save();
        } else {
          user = await User.create({ name: profile.name || email.split("@")[0], email, googleId: profile.sub });
        }
      }

      const session = jwt.sign({ sub: user._id.toString(), type: "google-session" }, jwtSecret, { expiresIn: "5m" });
      res.cookie("google_auth_session", session, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 5 * 60 * 1000,
      });
      loginUrl.searchParams.set("google", "success");
    } catch (error) {
      console.error("Google sign-in failed:", error.message);
      loginUrl.searchParams.set("google", "error");
    }
    res.redirect(loginUrl.toString());
  });

  app.post("/api/auth/google/session", async (req, res) => {
    try {
      const session = jwt.verify(req.cookies.google_auth_session, jwtSecret);
      if (session.type !== "google-session") throw new Error("Invalid session");
      const user = await User.findById(session.sub);
      if (!user) throw new Error("User not found");
      res.clearCookie("google_auth_session");
      await authenticate(res, user);
    } catch {
      res.status(401).json({ message: "Google sign-in session has expired. Please try again." });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res, next) => {
    try {
      if (typeof req.body.email !== "string" || req.body.email.length > 254) return res.status(400).json({ message: "Enter a valid email address." });
      const email = req.body.email.toLowerCase().trim();
      const user = email ? await User.findOne({ email }) : null;
      const response = {
        message: "If an account exists for that email, a reset link has been created.",
      };

      if (user) {
        const token = jwt.sign(
          { sub: user._id.toString(), type: "password-reset", version: user.resetPasswordVersion },
          resetJwtSecret,
          { expiresIn: "15m" }
        );
        const resetBase = env.NODE_ENV !== 'production' && trustedOrigins.has(req.headers.origin) ? `${req.headers.origin}${env.MOVIESHUB_BASE_PATH || ''}` : clientBase;
        const resetUrl = `${resetBase}/reset-password?token=${encodeURIComponent(token)}`;

        let emailSent = false;
        try { emailSent = await sendResetEmail(user.email, resetUrl); }
        catch { logger.error?.(JSON.stringify({ event: 'reset_email_failed' })); }
        if (emailSent) {
          // Keep the public response identical for unknown and known accounts.
        } else if (env.NODE_ENV !== "production") {
          response.message = "A password reset link has been generated.";
          response.resetUrl = resetUrl;
          // Development-only resetUrl is returned to the caller; never logged.
        }
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/reset-password", async (req, res, next) => {
    try {
      const { token, password } = req.body;
      if (typeof token !== "string" || token.length > 4096 || !passwordIsValid(password)) {
        return res.status(400).json({ message: "Use a valid reset link and a password with at least 10 characters and at most 72 UTF-8 bytes." });
      }

      const payload = jwt.verify(token, resetJwtSecret);
      if (payload.type !== "password-reset") throw new Error("Invalid reset token");

      const user = await User.findById(payload.sub);
      if (!user || user.resetPasswordVersion !== payload.version) {
        return res.status(400).json({ message: "This reset link is invalid or has already been used." });
      }

      user.passwordHash = await bcrypt.hash(password, 12);
      user.resetPasswordVersion += 1;
      await user.save();
      await mongoose.model("AccountSession").deleteMany({ userId: user._id });
      res.json({ message: "Password updated. You can now log in." });
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError" || error.message === "Invalid reset token") {
        return res.status(400).json({ message: "This reset link is invalid or has expired." });
      }
      next(error);
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res, next) => {
    try {
      const user = await User.findById(req.auth.sub);
      if (!user) return res.status(401).json({ message: "User account no longer exists." });
      res.json({ user: serializeUser(user, req.accountSession) });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (req,res) => res.status(404).json({ message: "API route not found." }));
  // In production, Express serves the React build and API from the same port.
  app.use(express.static(clientDistPath));
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });


  app.use(errorHandler);
  return { app, catalogue, User, Review, Report };
}
module.exports = { createApp };
