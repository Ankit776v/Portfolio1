# ConnectHub
A full-stack hybrid social network (social feed + professional profiles + connections + messaging).

## Setup
1. Install Node.js 22.13+ (including Node.js 26). No native SQLite addon or Visual Studio Build Tools required.
2. In this folder run `npm install`.
3. Run `npm start`.

**Existing installation:** Delete the old `node_modules` and `package-lock.json` in the ConnectHub folder before running `npm install` again. The SQLite database format remains compatible.
4. Open http://localhost:3000.
5. Register two accounts (use two browsers or incognito) to test follows, chat, likes and notifications.

## Features
- Registration, login, logout with bcrypt password hashing and HTTP-only cookie sessions.
- Profile editing: name, professional headline, bio, avatar and cover photo.
- Image uploads (JPG/PNG/WebP, 2 MB maximum).
- Public feed, create/delete posts, like/unlike, comment, copy share link.
- Search people, follow/unfollow, view user profiles and posts.
- One-to-one messaging with real-time Socket.IO events and persisted SQLite messages.
- Real-time notification events for likes, comments and follows.
- Responsive desktop/mobile interface.

## Storage
SQLite database is automatically created in `data/connecthub.sqlite`; uploaded images are saved in `uploads/`. Back up both directories before upgrades.

## Important deployment notes
This is a portfolio/demo application, not a production-hardened service. Before public deployment add CSRF protection, rate limiting, email verification/password recovery, content moderation, image signature validation, account blocking/reporting, session cleanup, pagination and secure HTTPS hosting. Set `NODE_ENV=production` when using HTTPS. Posts are publicly visible to signed-in members. Share copies links to the current page; deep-linked individual post routes are not yet implemented. Notifications are generated from likes, comments and follows, not from messages. `npm install` requires internet access.

### Unread badges
The Chats and Alerts icons show live unread counts (capped visually at 99+). Counts are stored in SQLite, delivered over Socket.IO, and restored on sign-in/reconnect. Opening a conversation marks its received messages read; use **Mark all read** on Alerts to clear notification counts. Existing message tables are migrated automatically by adding a `read` column.
