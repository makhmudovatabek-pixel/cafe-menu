# StackHost deployment

This repository is configured for StackHost with Node.js 22. StackHost should run
`npm install` to build and `npm start` to launch the app. The server listens on the
`PORT` value provided by StackHost.

## Required settings

In the StackHost app settings, set:

- `ADMIN_PASSWORD` to the administrator password you want (currently `5555`).
- `NODE_ENV` to `production` so the admin session cookie is secure on HTTPS.

Do not upload or commit `.env`; use StackHost's environment-variable settings.

The menu is saved in `data/menu.json`, and photos uploaded by the admin panel go
to `public/uploads`. Check that the StackHost plan preserves app files across
restarts and redeployments before using admin edits as the only copy of your menu.
