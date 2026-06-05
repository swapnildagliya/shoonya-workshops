# workshops.shoonyadance.com — GitHub Pages repo

This folder is the root of the GitHub Pages site for `workshops.shoonyadance.com`.

## First-time setup

1. Create a new repo on GitHub (e.g. `shoonya-workshops`), copy its URL.
2. Open `push-to-github.sh` and replace `YOUR_GITHUB_REPO_URL` with your repo URL:
   ```
   REPO_URL="https://github.com/your-username/shoonya-workshops.git"
   ```
3. In your DNS panel add one record:
   ```
   Type:  CNAME
   Name:  workshops
   Value: your-github-username.github.io
   ```
4. In the GitHub repo → Settings → Pages → select branch `main` → Save.

## Deploying updates

Double-click `push-to-github.sh` (or run it in Terminal):
```bash
cd /path/to/deploy
bash push-to-github.sh
```

The site updates at `workshops.shoonyadance.com/round-trip-to-cuba/` within ~60 seconds.

## Adding future workshops

Drop a new subfolder (e.g. `afro-cuban-intensive/`) with its own `index.html` and `nl/index.html` into this same repo. One CNAME, many workshops.
