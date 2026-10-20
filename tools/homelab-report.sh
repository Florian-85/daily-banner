#!/usr/bin/env bash
# Shows how the nightly profile publication of the private Homelab repository is doing, without touching it.
# Usage: tools/homelab-report.sh [number-of-runs]   (default 7)
# Needs the GitHub CLI, logged in with access to the Homelab repository.
set -euo pipefail

REPO="${HOMELAB_REPOSITORY:-Florian-85/homelab}"
LIMIT="${1:-7}"

gh run list -R "$REPO" --workflow github-profile.yml --limit "$LIMIT" \
  --json databaseId,event,status,conclusion,createdAt \
  --jq '.[] | [.databaseId, .event, .status, .conclusion, .createdAt] | @tsv' |
while IFS=$'\t' read -r id event status conclusion created; do
  echo "== ${created}  run ${id}  (${event}, ${status}, ${conclusion})"
  # PROFILE_REPORT is the structured line the Homelab package prints once its log is in place.
  gh run view "$id" -R "$REPO" --log 2>/dev/null |
    grep -E "PROFILE_REPORT|Published|up to date|warning:|stack additions|unknown technologies|stack: projects|##\[error\]" |
    sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //' | head -15 || true
done
