#!/usr/bin/env bash
# Commits and pushes the generated folder, only when something changed.
# Inputs (environment): DB_OUTPUT_DIR, DB_MESSAGE. It touches nothing outside that folder.
set -euo pipefail

dir="${DB_OUTPUT_DIR:?DB_OUTPUT_DIR is required}"
message="${DB_MESSAGE:-chore: update daily banner}"

case "$dir" in
  /* | [A-Za-z]:* | *..*)
    echo "::error title=daily-banner::output-dir must be a folder inside the repository (got: $dir)"
    exit 1
    ;;
esac

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "$dir"
if git diff --cached --quiet; then
  echo "The banner did not change: nothing to commit."
  exit 0
fi

git commit -m "$message"
if ! git push; then
  # Someone pushed while we were generating: replay our single commit on top and try once more.
  git pull --rebase
  git push
fi
