# Git Graph Enhanced

High-performance git history visualization for VS Code, powered by a Rust backend.

> ⚠️ Early development — not yet published on the marketplace.

## Features

- **Interactive commit graph** — DAG visualization with color-coded branch lines and bezier curve merge edges
- **Commit detail panel** — click any commit to see author, date, full message, and changed files
- **Branch & tag badges** — visual labels on the graph, HEAD indicator
- **Search** — filter by commit message, author, or SHA across the entire repository
- **VS Code diff integration** — right-click a commit to open diffs in VS Code's native diff editor
- **Virtual scrolling** — smooth 60fps scrolling through large histories
- **Keyboard navigation** — arrow keys, Enter, Escape, Home/End, Ctrl+F, Ctrl+C
- **Multi-repo workspaces** — auto-discovers git repos, picker for multi-root workspaces
- **Live updates** — watches `.git` for external changes (commits, branch switches, pulls)
- **Crash recovery** — auto-restarts the backend if it crashes (up to 3 retries)

## Architecture

```
Webview (Canvas) ←→ Extension Host (TypeScript) ←→ Rust Backend (JSON-RPC stdin/stdout)
```

- **Rust backend** — git operations via gitoxide (`gix`), graph layout algorithm, file content retrieval
- **Extension host** — spawns Rust binary, relays messages, manages webview lifecycle
- **Webview** — Canvas-based graph rendering, DOM-based commit detail panel, search bar

## Requirements

- VS Code 1.85+
- Rust toolchain (for development only — published extension includes pre-built binaries)

## Development

```bash
# Install dependencies
npm install
cargo build --workspace

# Build extension + webview bundles
node esbuild.mjs

# Build Rust binary for current platform
bash scripts/build-rust.sh

# Run in VS Code
# Press F5 to launch Extension Development Host
```

### Watch mode

```bash
# Terminal 1: watch TypeScript
node esbuild.mjs --watch

# Terminal 2: rebuild Rust on changes
cargo watch -x 'build --workspace'
```

### Testing

```bash
cargo test --workspace           # Rust tests
cargo clippy --workspace         # Rust lints
cargo fmt --all -- --check       # Rust formatting
npm test                         # TypeScript tests
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gitGraphEnhanced.maxCommits` | 500 | Commits to load per page |
| `gitGraphEnhanced.requestTimeout` | 30 | Backend request timeout (seconds) |
| `gitGraphEnhanced.maxDepthOfRepoSearch` | 1 | Folder depth for repo discovery |
| `gitGraphEnhanced.logLevel` | info | Output channel log level |

## Commands

| Command | Description |
|---------|-------------|
| `Git Graph Enhanced: Show Git Graph` | Open the graph view |

## Keyboard Shortcuts (in graph)

| Key | Action |
|-----|--------|
| ↑ / ↓ | Navigate commits |
| Enter | Open commit detail |
| Escape | Close detail / clear selection |
| Home / End | Jump to first / last commit |
| PageUp / PageDown | Scroll by page |
| Ctrl+F / Cmd+F | Focus search |
| Ctrl+C / Cmd+C | Copy selected commit SHA |
| Right-click | Context menu (copy SHA, view diff) |

## License

MIT — see [LICENSE](LICENSE).
