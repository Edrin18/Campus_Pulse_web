# Campus Pulse (website)

Static site: no build step. Files: index.html, app.js, util.js, style.css, config.js, manifest.json, assets/.

1. Firebase console > Project settings > Your apps > Add app > Web (</>). Copy apiKey and appId into config.js.
2. Firebase console > Authentication > Settings > Authorized domains > add your Render domain (for example campus-pulse.onrender.com).
3. Push this folder to a GitHub repository, then on Render: New > Static Site > connect the repo.
   Build Command: (leave empty). Publish Directory: . (a single dot).
