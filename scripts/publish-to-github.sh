#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${1:-Tracker}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it from https://cli.github.com/ and run: gh auth login" >&2
  exit 1
fi

gh auth status >/dev/null
OWNER="$(gh api user --jq .login)"
FULL_REPO="$OWNER/$REPO_NAME"

if [[ ! -f package.json ]]; then
  echo "Run this script from the project root (the folder containing package.json)." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init --initial-branch=main
fi
git branch -M main
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git add -A
  git commit -m "Initial Streako Elite scaffold"
fi

if gh repo view "$FULL_REPO" >/dev/null 2>&1; then
  URL="https://github.com/$FULL_REPO.git"
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$URL"
  else
    git remote add origin "$URL"
  fi
  git push -u origin HEAD:main
  echo "Updated existing repository: https://github.com/$FULL_REPO"
else
  gh repo create "$FULL_REPO" --private --source=. --remote=origin --push
  echo "Created private repository: https://github.com/$FULL_REPO"
fi