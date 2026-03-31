# Git Graph Enhanced — Project Vision

## What

A VS Code extension that visualizes git history as an interactive graph. Clean-room rewrite (MIT) — no code from the original Git Graph extension (GPL-3.0).

## Why

The original Git Graph extension is abandoned (last update 2022). It's the most-installed git graph extension on the marketplace with 10M+ installs, but it's slow on large repos, has unfixed bugs, and the GPL-3.0 license limits commercial use. There's a clear gap for a fast, maintained, MIT-licensed alternative.

## Competitive Landscape (researched 2026-03-31)

| Extension | Approach | Strengths | Weaknesses |
|-----------|----------|-----------|------------|
| Git Graph (mhutchie) | Webview, pure TS/JS | 10M+ installs, feature-rich | Abandoned 2022, slow on large repos, GPL-3.0 |
| GitLens | Inline annotations + webview | Dominant market share, deep integration | Graph features behind Pro paywall |
| Git Lean (danieldev) | Canvas + React 19 + TS | Interactive rebase/squash from graph, modern | Brand new (89 installs), no native backend |
| BoomerGit | Native editor decorations (SVG tiles) | No webview overhead, fast | Limited interactivity, novel/unproven approach |
| git-log--graph | Text-based in webview | Highly customizable, sticky headers | Not a true graphical graph |
| GitViz | Inline blame + graph | Free, lightweight | Limited graph features |

**Our differentiators:**
- Rust backend (gitoxide) — native performance on 100k+ commit repos, no JS GC pauses
- Graph layout computed in Rust — send pre-computed positions to webview, no layout math in JS
- Canvas rendering with virtual scrolling — same approach as Git Lean but with Rust-powered computation
- MIT license — no commercial use restrictions
- Clean modern architecture — JSON-RPC IPC, typed contracts, testable layers

## Architecture

```
Webview (Canvas) ←→ Extension Host (TS) ←→ Rust Backend (JSON-RPC stdin/stdout)
```

- Rust backend for speed — gitoxide for git ops, native graph layout algorithm
- Canvas-based rendering — handles 100k+ commits without DOM overhead
- JSON-RPC over stdin/stdout — simple, debuggable, cross-platform IPC
- Virtual scrolling — only render visible viewport

## Core Features (MVP)

1. **Commit graph** — DAG visualization with branch lines, color-coded by branch
2. **Commit detail panel** — author, date, message, changed files list
3. **Branch/tag labels** — visual indicators on the graph
4. **Scroll & paginate** — smooth virtual scroll, load more on demand
5. **Basic search** — filter by author, message text, commit hash

## Post-MVP Features

- Diff viewer (inline + side-by-side)
- Branch operations (checkout, create, delete from graph)
- Remote awareness (fetch/pull/push indicators)
- File history (graph filtered to single file)
- Stash visualization
- Cherry-pick / rebase from graph
- Customizable themes and graph styles
- Multi-repo workspace support

## Performance Targets

| Metric | Target |
|--------|--------|
| Graph visible | < 2s for repos up to 10k commits |
| Scroll | 60fps smooth |
| Memory | < 200MB for 100k+ commit repos |
| Extension size | < 15MB packaged (including Rust binary) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Git operations | Rust + gitoxide (gix) |
| Graph layout | Rust (custom DAG algorithm) |
| IPC | JSON-RPC over stdin/stdout |
| Extension host | TypeScript + VS Code API |
| Webview | Canvas + vanilla TypeScript |
| Build | cargo + esbuild + vsce |
| Tests | cargo test + vitest |

## Technical Notes

### gitoxide (gix) API
- `gix::open(path)` to open a repo (explicit path, not discover)
- `repo.rev_walk([head_id]).sorting(ByCommitTime).all()` for commit traversal
- `repo.references().all()` for branches/tags
- Iterator-based — natural fit for pagination with `.skip(n).take(count)`
- Set `repo.object_cache_size()` for performance on repeated lookups

### Graph Layout Algorithm
Well-known greedy column assignment approach (designed from first principles):
1. Process commits in topological order (newest first)
2. Assign each commit to the lowest available column
3. When a branch merges, free its column for reuse
4. Route edges between parent/child with bezier curves for crossings
5. Assign colors per-branch (cycle through a palette)

Input: `[{id, parentIds}]` → Output: `[{commitId, column, color}]` + `[{from, to, fromCol, toCol, color}]`

This runs in Rust and ships pre-computed to the webview — zero layout math in JavaScript.

### Canvas Rendering
- Virtual scrolling: only render ~50 visible rows at a time
- `requestAnimationFrame` for smooth redraws
- Batch Canvas path operations (one `beginPath`/`stroke` per frame)
- `fillText` for commit messages (Canvas text is safe — no HTML injection)
- Hit testing via row index math (click Y → commit index)

## Project Structure

```
crates/
├── git-graph-core/       # Library: git ops, graph layout, data types
└── git-graph-server/     # Binary: JSON-RPC stdin/stdout server
src/                      # Extension host: commands, backend IPC, webview provider
webview/                  # Canvas graph UI, commit panel, search
scripts/                  # Build & packaging scripts
```

## Implementation Plan

### Phase 1: Foundation

All 4 workers in parallel — no cross-dependencies.

**Alpha (Rust backend):**
- Cargo workspace setup (root `Cargo.toml` + two crates)
- `git-graph-core`: types (`Commit`, `Branch`, `Tag`), `gix::open`, commit listing with pagination, branch listing
- `git-graph-server`: JSON-RPC stdin/stdout loop, `getCommits` + `getBranches` handlers
- Error types with `thiserror` (core) and `anyhow` (server)

**Bravo (Extension host):**
- `package.json` (extension manifest, `activationEvents`, `contributes.commands`)
- `tsconfig.json` (strict mode)
- `src/extension.ts` — activate/deactivate
- `src/backend.ts` — spawn Rust binary, JSON-RPC request/response over stdin/stdout
- `src/webview-provider.ts` — create webview panel with CSP
- `src/types.ts` — shared types matching Rust serde structs
- `src/commands.ts` — register `gitGraphEnhanced.show`
- `src/config.ts` — extension settings access

**Charlie (Webview UI):**
- `webview/index.html` — scaffold with CSP meta tag, nonce-based script loading
- `webview/src/main.ts` — entry point, init message handler
- `webview/src/graph-renderer.ts` — Canvas setup, render commit dots + straight lines
- `webview/src/message-handler.ts` — postMessage bridge (send/receive)
- `webview/src/theme.ts` — read VS Code CSS custom properties
- `webview/styles/main.css` — base layout

**Delta (Build & infra):**
- `esbuild.mjs` — bundle extension host + webview separately
- `scripts/build-rust.sh` — compile Rust for current platform
- `.vscodeignore` — exclude `target/`, `node_modules/`, test files
- `LICENSE` (MIT)
- `README.md` skeleton
- `.github/workflows/ci.yml` — basic lint + test

**Phase 1 integration milestone:** Open extension → spawns Rust binary → sends `getCommits` → receives JSON response → webview renders commit dots on Canvas.

### Phase 2: Usable Graph

**Alpha:** DAG layout algorithm (column assignment, edge routing, color assignment), `getCommitDetail` RPC method
**Bravo:** Wire `getGraph` RPC, forward commit detail to webview
**Charlie:** Render bezier curve edges, branch/tag badges, virtual scrolling, commit detail panel (click → show info), VS Code theme colors

**Phase 2 milestone:** Scroll through a real repo's history with proper branch lines, click a commit to see details.

### Phase 3: Interactive

**Alpha:** `search` + `getDiff` RPC methods, file change detection
**Bravo:** Keyboard navigation commands, context menu registration, clipboard bridge
**Charlie:** Search/filter UI (debounced input), changed files list, basic diff display, context menu rendering

**Phase 3 milestone:** Search commits, view diffs, copy SHA, keyboard navigate the graph.

### Phase 4: Polish & Ship

**Delta:** Cross-platform builds (macOS arm64/x64, Linux x64, Windows x64), CI/CD pipeline, marketplace packaging, `.vsix` build script
**Charlie:** Settings UI, graph style options (line thickness, colors)
**All:** Performance profiling on large repos (linux kernel, chromium), memory optimization, bug fixes
**Bravo:** README with screenshots, marketplace listing copy

**Phase 4 milestone:** Published on VS Code Marketplace, works on all platforms, handles 100k+ commit repos.
