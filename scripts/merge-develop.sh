#!/usr/bin/env bash
set -euo pipefail

SOURCE_BRANCH="${1:-}"

assert_clean() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree not clean. Commit or stash changes before merging." >&2
    exit 1
  fi
}

if [[ -z "$SOURCE_BRANCH" ]]; then
  SOURCE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

if [[ "$SOURCE_BRANCH" == "develop" ]]; then
  echo "Source branch is 'develop'. Run from a feature branch or pass the source branch." >&2
  exit 1
fi

assert_clean

echo "Fetching origin..."
git fetch origin

echo "Switching to develop..."
git switch develop

echo "Pulling latest develop..."
git pull --ff-only

echo "Merging $SOURCE_BRANCH into develop..."
git merge --no-ff "$SOURCE_BRANCH" -m "merge: $SOURCE_BRANCH into develop"

echo "Pushing develop..."
git push origin develop

echo "Switching back to $SOURCE_BRANCH..."
git switch "$SOURCE_BRANCH"

echo "Done."
