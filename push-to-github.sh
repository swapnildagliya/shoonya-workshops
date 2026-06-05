#!/bin/bash
set -e

REPO_URL="https://github.com/swapnildagliya/shoonya-workshops.git"
BRANCH="main"

echo "── Round Trip to Cuba · GitHub Pages deploy ──"

# Init repo if not already one
if [ ! -d ".git" ]; then
  echo "→ Initialising git repo..."
  git init
  git branch -M "$BRANCH"
fi

# Set / update remote
if git remote get-url origin &>/dev/null; then
  echo "→ Remote already set: $(git remote get-url origin)"
else
  if [ "$REPO_URL" = "YOUR_GITHUB_REPO_URL" ]; then
    echo ""
    echo "  ⚠  Set your repo URL first:"
    echo "     Open push-to-github.sh and replace YOUR_GITHUB_REPO_URL"
    echo "     Example: https://github.com/shoonyadance/shoonya-workshops.git"
    echo ""
    exit 1
  fi
  echo "→ Adding remote origin..."
  git remote add origin "$REPO_URL"
fi

# Stage, commit, push
# Note: CNAME is excluded — GitHub Pages manages it from repo Settings.
# Committing CNAME on every deploy triggers GitHub's delete/recreate cycle
# which resets SSL cert provisioning each time.
echo "→ Staging all files (excluding CNAME)..."
git add -A
git restore --staged CNAME 2>/dev/null || true

TIMESTAMP=$(date "+%Y-%m-%d %H:%M")
echo "→ Committing: deploy $TIMESTAMP"
git commit -m "deploy $TIMESTAMP" 2>/dev/null || echo "  (nothing new to commit)"

echo "→ Pushing to $BRANCH..."
git push -u origin "$BRANCH"

echo ""
echo "✓ Done — workshops.shoonyadance.com should update within ~60 seconds."
