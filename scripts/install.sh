#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="${REPO_OWNER:-JONATHAN7D}"
REPO_NAME="${REPO_NAME:-login-OpenCloud}"
BRANCH="${BRANCH:-main}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/.login-opencloud}"
TMP_DIR="$(mktemp -d)"
ARCHIVE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.tar.gz"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this installer again." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download the repository archive." >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required to extract the repository archive." >&2
  exit 1
fi

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
else
  echo "Bun not found. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  BUN_BIN="$HOME/.bun/bin/bun"
fi

if [ ! -x "$BUN_BIN" ]; then
  echo "Bun installation was not found after setup. Open a new terminal and try again." >&2
  exit 1
fi

echo "Downloading ${ARCHIVE_URL}"
curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$TMP_DIR"

EXTRACTED_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [ -z "$EXTRACTED_DIR" ]; then
  echo "The GitHub archive could not be extracted." >&2
  exit 1
fi

rm -rf "$INSTALL_ROOT"
mv "$EXTRACTED_DIR" "$INSTALL_ROOT"

echo "Installing dependencies..."
"$BUN_BIN" install --cwd "$INSTALL_ROOT"

echo "Building OpenClaude..."
"$BUN_BIN" run --cwd "$INSTALL_ROOT" build

BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_ROOT/bin/openclaude" "$BIN_DIR/openclaude"

echo
echo "OpenClaude installed successfully."
echo "Install directory: $INSTALL_ROOT"
echo "Launcher: $BIN_DIR/openclaude"
echo
echo "If \`openclaude\` is not found yet, add this to your shell profile:"
echo "  export PATH=\"$BIN_DIR:\$PATH\""
