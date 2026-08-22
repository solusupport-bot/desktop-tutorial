#!/usr/bin/env bash
# Land in Korea — Facebook + Threads only setup
# Brand operation rule: Instagram values are intentionally not collected here.
set -euo pipefail
umask 077

REPOSITORY="${REPOSITORY:-solusupport-bot/desktop-tutorial}"
SAVE_LOCAL_ENV="${SAVE_LOCAL_ENV:-0}"

die() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required. Install it, then run this script again."; }
ask_required() {
  local label="$1" value=""
  while [ -z "$value" ]; do
    printf '%s: ' "$label" >&2
    IFS= read -r -s value
    printf '\n' >&2
  done
  printf '%s' "$value"
}
ask_plain_required() {
  local label="$1" value=""
  while [ -z "$value" ]; do
    printf '%s: ' "$label" >&2
    IFS= read -r value
  done
  printf '%s' "$value"
}

need gh
gh auth status >/dev/null 2>&1 || die "GitHub CLI login is required. Run: gh auth login"

printf '\nLand in Korea — Facebook + Threads setup\n'
printf 'Instagram is intentionally excluded until the Meta protection limit is lifted.\n\n'

FB_PAGE_ACCESS_TOKEN="$(ask_required 'FB_PAGE_ACCESS_TOKEN (hidden input)')"
FB_PAGE_ID="$(ask_plain_required 'FB_PAGE_ID')"
THREADS_ACCESS_TOKEN="$(ask_required 'THREADS_ACCESS_TOKEN (hidden input)')"
THREADS_USER_ID="$(ask_plain_required 'THREADS_USER_ID')"

trap 'unset FB_PAGE_ACCESS_TOKEN THREADS_ACCESS_TOKEN' EXIT

printf '\nRegistering four GitHub Actions Secrets in %s ...\n' "$REPOSITORY"
printf '%s' "$FB_PAGE_ACCESS_TOKEN" | gh secret set FB_PAGE_ACCESS_TOKEN --repo "$REPOSITORY"
printf '%s' "$FB_PAGE_ID" | gh secret set FB_PAGE_ID --repo "$REPOSITORY"
printf '%s' "$THREADS_ACCESS_TOKEN" | gh secret set THREADS_ACCESS_TOKEN --repo "$REPOSITORY"
printf '%s' "$THREADS_USER_ID" | gh secret set THREADS_USER_ID --repo "$REPOSITORY"

if [ "$SAVE_LOCAL_ENV" = "1" ]; then
  ENV_PATH="ops/facebook_threads/local.env"
  cat > "$ENV_PATH" <<EOF
FB_PAGE_ACCESS_TOKEN=$FB_PAGE_ACCESS_TOKEN
FB_PAGE_ID=$FB_PAGE_ID
THREADS_ACCESS_TOKEN=$THREADS_ACCESS_TOKEN
THREADS_USER_ID=$THREADS_USER_ID
EOF
  chmod 600 "$ENV_PATH"
  printf 'Optional local values saved at %s with owner-only permissions.\n' "$ENV_PATH"
else
  printf 'Local token file was not created. To create one for local testing, rerun with SAVE_LOCAL_ENV=1.\n'
fi

printf '\nDone. GitHub Secrets registered: FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, THREADS_ACCESS_TOKEN, THREADS_USER_ID\n'
printf 'No Instagram secret was created or changed.\n'
