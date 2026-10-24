# Local forum

Forum DOM, scripts, styles and icon font are adapted from the user's supplied `meixinji-local.apk` (Library version 8, 2026-10-24). This directory is bundled in both Float Android packages; it does not load the source phone or its website.

`SquareForumApp` owns API requests, existing contacts/chat links/worldbooks and the persona-scoped KV namespace. `host-adapter.js` exposes only the services needed by the forum. Board roles and certifications append generated results, and permissions are checked again on moderation actions. Image generation starts only from an individual post's confirmation button.

`forumBack()` closes nested dialogs, settings, details or DMs before leaving the forum. The parent header and Android Back use this same handler.

Regression test: `node scripts/test-square-forum.cjs` with Playwright installed. Optional `FORUM_CHROME` points to a local Chromium executable. API and image responses in this test are fixtures; user keys are never required.
