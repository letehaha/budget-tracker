#!/usr/bin/env bash
#
# Pushes locally-edited translations UP to Crowdin.
#
# Why this exists:
#   The CI sync is deliberately one-way. crowdin-upload.yml uploads only English
#   SOURCE strings; crowdin-download.yml pulls translations back and opens a PR.
#   Neither ever uploads translations. So when translations are produced locally
#   (the release bulk-translate pass, or hand-edits to a locale file), Crowdin
#   never learns about them. The next download then pulls Crowdin's older, emptier
#   state and the download PR shows those translations being DELETED — overwriting
#   local work with blanks. Run this script to seed Crowdin with the local
#   translations first, so download and local agree again.
#
# What it does:
#   crowdin upload translations, using the repo's crowdin.yml. Project id and API
#   token come from .env.development.local (the same file docker-dev.sh manages),
#   or from the environment if already exported.
#
# Approval:
#   Local is the source of truth for this flow, so imported translations are
#   auto-approved (--auto-approve-imported) — they land green in Crowdin, not as
#   unapproved blue suggestions needing a second pass in the editor.
#
# Caveat — untranslated placeholders:
#   In-repo locale files carry the English source text for every UNtranslated key.
#   A blanket upload pushes that English text up as the translation for those keys,
#   and auto-approval marks it approved. That is fine at release time when every
#   locale is fully translated; for a partially-translated locale it would approve
#   English-as-translation. Preview with --dryrun and scope with -l <code> first.
#
# Usage:
#   npm run i18n:crowdin:upload                 # upload + approve all translations
#   npm run i18n:crowdin:upload -- --dryrun     # list what would upload, change nothing
#   npm run i18n:crowdin:upload -- -l uk        # single language (two-letter code)
#   Any extra args are forwarded verbatim to `crowdin upload translations`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV="$ROOT/.env.development.local"
CONFIG="$ROOT/crowdin.yml"

if ! command -v crowdin >/dev/null 2>&1; then
  echo "error: crowdin CLI not found. Install it with: npm i -g @crowdin/cli" >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "error: $CONFIG not found." >&2
  exit 1
fi

read_var() { # read_var FILE NAME -> value (last assignment wins, like dotenv)
  grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

# crowdin.yml resolves creds via these env var names (project_id_env / api_token_env).
# Prefer values already in the environment; otherwise pull from .env.development.local.
if [[ -z "${CROWDIN_PROJECT_ID:-}" ]]; then
  CROWDIN_PROJECT_ID="$(read_var "$LOCAL_ENV" CROWDIN_PROJECT_ID)"
fi
if [[ -z "${CROWDIN_PERSONAL_TOKEN:-}" ]]; then
  CROWDIN_PERSONAL_TOKEN="$(read_var "$LOCAL_ENV" CROWDIN_PERSONAL_TOKEN)"
fi

if [[ -z "${CROWDIN_PROJECT_ID:-}" || -z "${CROWDIN_PERSONAL_TOKEN:-}" ]]; then
  echo "error: CROWDIN_PROJECT_ID and CROWDIN_PERSONAL_TOKEN must be set." >&2
  echo "       Add them to $LOCAL_ENV or export them before running." >&2
  exit 1
fi
export CROWDIN_PROJECT_ID CROWDIN_PERSONAL_TOKEN

echo "Uploading local translations to Crowdin (project $CROWDIN_PROJECT_ID)..."
exec crowdin upload translations --config "$CONFIG" --auto-approve-imported "$@"
