#!/usr/bin/env bash
set -euo pipefail

cargo build --release --package git-graph-server

mkdir -p dist

BINARY="target/release/git-graph-server"
if [[ "$(uname)" == "MINGW"* || "$(uname)" == "MSYS"* ]]; then
  BINARY="${BINARY}.exe"
fi

cp "$BINARY" dist/git-graph-server
chmod +x dist/git-graph-server

echo "Binary size: $(du -h dist/git-graph-server | cut -f1)"
