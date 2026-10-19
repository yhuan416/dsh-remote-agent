#!/usr/bin/env bash
# Install dsh-remote-agent as a linked plugin in a dsh profile.
# Usage: ./scripts/install.sh [profile]        (default: web)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH="$PROFILE_DIR/cordis.patch.yml"

[ -f "$ROOT/lib/index.js" ] || { echo "error: lib/index.js missing; run this from the repository" >&2; exit 1; }
[ -d "$PROFILE_DIR" ] || { echo "error: profile '$PROFILE' not found at $PROFILE_DIR (run dsh web once to create it)" >&2; exit 1; }

mkdir -p "$DSH_HOME/profiles/node_modules" "$PROFILE_DIR/node_modules"
ln -sfn "$ROOT" "$PROFILE_DIR/node_modules/dsh-remote-agent"
ln -sfn "$ROOT" "$DSH_HOME/profiles/node_modules/dsh-remote-agent"
echo "linked: $PROFILE_DIR/node_modules/dsh-remote-agent -> $ROOT"

if grep -q 'dsh-remote-agent' "$PATCH" 2>/dev/null; then
  echo "patch already mentions dsh-remote-agent; nothing appended"
else
  cp "$PATCH" "$PATCH.bak-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
  cat >> "$PATCH" <<'YAML'

# dsh-remote-agent: publish this process launch token for a remote hub
- insert:
    - id: remote-agent
      name: dsh-remote-agent
YAML
  echo "appended the remote-agent row to $PATCH"
fi

echo
echo "next:"
echo "  1. restart dsh web"
echo "  2. cat ~/.dsh/remote-agent.json     # should contain a token and a fresh updatedAt"
