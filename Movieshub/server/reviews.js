const { rateLimit } = require('./security');

const SORTS = { newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 }, highest: { rating: -1, createdAt: -1, _id: -1 }, lowest: { rating: 1, createdAt: -1, _id: -1 } };
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function pagination(query) {
  const page = Number(query.page ?? 1), limit = Number(query.limit ?? 10), sort = query.sort ?? 'newest';
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Object.hasOwn(SORTS, sort)) fail('Invalid review page, limit, or sort order.');
  return { page, limit, sort };
}
function movieIdentity(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240) fail('A valid movie ID is required.');
  return value.trim();
}
function reviewInput(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (typeof body.rating !== 'number' || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || text.length < 150 || text.length > 1500) fail('Enter a rating from 1 to 5 and a review of 150 to 1,500 characters.');
  if (body.movieTitle !== undefined && (typeof body.movieTitle !== 'string' || body.movieTitle.length > 240)) fail('Title must contain at most 240 characters.');
  return { text, rating: body.rating, movieTitle: body.movieTitle?.trim() || '' };
}
function serialize(review) {
  return { id: String(review._id), movieId: review.movieId, movieTitle: review.movieTitle, rating: review.rating, text: review.text, createdAt: review.createdAt, updatedAt: review.updatedAt, user: { id: review.user?._id?.toString(), name: review.user?.name || 'Movieshub member' } };
}

module.exports = function installReviews(app, { Review, mongoose, requireAuth }) {
  const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
  const writeLimit = rateLimit({ max: 30, windowMs: 15 * 60000, key: req => req.auth.sub });
  const Report = mongoose.model('ReviewReport', new mongoose.Schema({ review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, reason: { type: String, enum: ['spam','abuse','spoiler','other'], required: true }, status: { type: String, enum: ['pending','dismissed','resolved'], default: 'pending' } }, { timestamps: true }));
  Report.schema.index({ review: 1, user: 1 }, { unique: true });
  const checkedId = id => { if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) fail('A valid review ID is required.'); return id; };

  app.get('/api/movies/:movieId/reviews', route(async (req, res) => {
    const movieId = movieIdentity(req.params.movieId), { page, limit, sort } = pagination(req.query);
    const [reviews, stats] = await Promise.all([
      Review.find({ movieId }).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).populate('user', 'name').lean(),
      Review.aggregate([{ $match: { movieId } }, { $group: { _id: null, total: { $sum: 1 }, average: { $avg: '$rating' } } }]),
    ]);
    const total = stats[0]?.total || 0;
    res.json({ reviews: reviews.map(serialize), page, pageSize: limit, sort, total, totalPages: Math.max(1, Math.ceil(total / limit)), averageRating: total ? Math.round(stats[0].average * 100) / 100 : null });
  }));
  app.get('/api/account/reviews', requireAuth, route(async (req, res) => {
    const { page, limit, sort } = pagination(req.query), query = { user: req.auth.sub };
    const [reviews, total] = await Promise.all([Review.find(query).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).populate('user', 'name').lean(), Review.countDocuments(query)]);
    res.set('Cache-Control', 'no-store').json({ reviews: reviews.map(serialize), total, page, pageSize: limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  }));
  app.post('/api/movies/:movieId/reviews', requireAuth, writeLimit, route(async (req, res) => {
    const movieId = movieIdentity(req.params.movieId), input = reviewInput(req.body);
    const review = await Review.create({ ...input, movieId, user: req.auth.sub });
    await review.populate('user', 'name');
    res.status(201).json({ review: serialize(review) });
  }));
  app.put('/api/movies/:movieId/reviews/:reviewId', requireAuth, writeLimit, route(async (req, res) => {
    const movieId = movieIdentity(req.params.movieId), _id = checkedId(req.params.reviewId), { rating, text } = reviewInput(req.body);
    const review = await Review.findOneAndUpdate({ _id, movieId, user: req.auth.sub }, { $set: { rating, text } }, { returnDocument: 'after', runValidators: true }).populate('user', 'name');
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    res.json({ review: serialize(review) });
  }));
  app.delete('/api/movies/:movieId/reviews/:reviewId', requireAuth, writeLimit, route(async (req, res) => {
    const movieId = movieIdentity(req.params.movieId), _id = checkedId(req.params.reviewId);
    const result = await Review.deleteOne({ _id, movieId, user: req.auth.sub });
    if (!result.deletedCount) return res.status(404).json({ message: 'Review not found.' });
    await Report.deleteMany({ review: _id });
    res.status(204).end();
  }));
  app.post('/api/movies/:movieId/reviews/:reviewId/report', requireAuth, writeLimit, route(async (req, res) => {
    const movieId = movieIdentity(req.params.movieId), _id = checkedId(req.params.reviewId), reason = req.body.reason;
    if (!['spam','abuse','spoiler','other'].includes(reason)) fail('Choose a report reason.');
    const review = await Review.findOne({ _id, movieId });
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (String(review.user) === req.auth.sub) return res.status(400).json({ message: 'You can edit or delete your own review.' });
    await Report.updateOne({ review: _id, user: req.auth.sub }, { $setOnInsert: { reason, status: 'pending' } }, { upsert: true, runValidators: true });
    res.status(202).json({ message: 'Report received for review.' });
  }));
  return { Report };
};
module.exports.pagination = pagination;
module.exports.reviewInput = reviewInput;
