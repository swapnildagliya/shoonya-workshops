#!/bin/bash
set -e

REPO_URL="https://github.com/swapnildagliya/shoonya-workshops.git"
BRANCH="main"

echo "── Shoonya Workshops · GitHub Pages deploy ──"

# ── Pre-deploy gate ───────────────────────────────────────────────────────────
# On 2026-09-05 the Round Trip to Cuba page was still promoting the Indian Dance
# Summer Intensive six days after it ended, the Dutch hub had no date gate at all,
# and four other pages carried the same dead link. Nothing looked, so nothing
# caught it. This looks, every deploy.
#
# Override for a genuine emergency:  SKIP_CHECKS=1 bash push-to-github.sh
if [ -z "$SKIP_CHECKS" ]; then
  echo "→ Checking for links to finished events..."
  if ! node "$(dirname "$0")/checks/audit-expired-links.mjs"; then
    echo ""
    echo "  ✕ Deploy stopped. Gate or remove the links above, then run this again."
    echo "    (Emergency override: SKIP_CHECKS=1 bash push-to-github.sh)"
    exit 1
  fi
fi


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
