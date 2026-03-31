#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [ -n "$TARGET" ]; then
  cargo build --release --package git-graph-server --target "$TARGET"
  BINARY="target/$TARGET/release/git-graph-server"
else
  cargo build --release --package git-graph-server
  BINARY="target/release/git-graph-server"
fi

mkdir -p dist

if [[ "$BINARY" == *.exe ]] || [[ "$(uname)" == MINGW* ]] || [[ "$(uname)" == MSYS* ]]; then
  cp "${BINARY}.exe" dist/git-graph-server.exe 2>/dev/null || cp "$BINARY" dist/git-graph-server
else
  cp "$BINARY" dist/git-graph-server
  chmod +x dist/git-graph-server
fi

echo "Binary size: $(du -h dist/git-graph-server* | cut -f1)"
