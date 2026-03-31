# Architecture

## Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Extension kind | `"extensionKind": ["workspace"]` | Must run where the repo is — Remote SSH, WSL, Containers work natively |
| 2 | Webview panel restore | No serializer (Phase 1) | Simpler; panel disappears on restart, user re-opens. Add `WebviewPanelSerializer` later |
| 3 | retainContextWhenHidden | `true` | Re-rendering Canvas graph on every tab switch is too expensive |
| 4 | Workspace trust | `"untrustedWorkspaces": { "supported": false }` | We spawn a native binary — no useful degraded mode without it |
| 5 | gix version pinning | Exact pin (`=0.x.y`) | gix is pre-1.0, even patches can break |
| 6 | Initial load strategy | Single payload (Phase 1) | Simple; refactor to chunked delivery in Phase 2 with virtual scrolling |
| 7 | Bare repo support | Yes — show graph | Bare repos have commits and branches; skip file-level operations |
| 8 | Shallow clone handling | Render what exists + visual boundary | Don't block the user; show indicator where history ends |
| 9 | Git worktree support | Defer file watcher fix | `gix::open` handles worktrees correctly; fix watcher in Phase 3 |
| 10 | Activation events | `onCommand` + `workspaceContains:**/.git` | Status bar item needs extension active; backend is still lazy-spawned |

## Overview

Git Graph Enhanced is a VS Code extension with three layers:

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Window                        │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   Extension Host     │  │       Webview Panel      │ │
│  │   (TypeScript)       │  │    (HTML/CSS/Canvas)     │ │
│  │                      │  │                          │ │
│  │  • Commands          │  │  • Graph renderer        │ │
│  │  • Backend IPC       │◄─┤  • Commit detail panel   │ │
│  │  • Webview provider  ├─►│  • Search/filter UI      │ │
│  │  • Configuration     │  │  • Theme integration     │ │
│  └──────────┬───────────┘  └──────────────────────────┘ │
│             │ stdin/stdout                                │
│  ┌──────────▼───────────┐                                │
│  │   Rust Backend       │                                │
│  │   (native binary)    │                                │
│  │                      │                                │
│  │  • Git operations    │                                │
│  │  • Graph layout      │                                │
│  │  • JSON-RPC server   │                                │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

## Layers

### Rust Backend (`crates/`)

Two crates in a Cargo workspace:

**git-graph-core** (library) — pure logic, no I/O assumptions:
- Git operations via gitoxide (`gix`) — commit traversal, branch/tag listing, diffs
- Graph layout algorithm — DAG column assignment, edge routing, color assignment
- Data types — `Commit`, `Branch`, `Tag`, `GraphNode`, `GraphEdge`, `FileDiff`
- Error types via `thiserror`

**git-graph-server** (binary) — thin I/O shell:
- Reads JSON-RPC requests from stdin, writes responses to stdout
- Routes methods to `git-graph-core` functions
- Error handling via `anyhow`, converted to JSON-RPC errors at the boundary
- stderr reserved for logging (not parsed by extension host)

Why two crates: the core library is testable without I/O mocking. The server is a thin adapter.

### Extension Host (`src/`)

TypeScript running in VS Code's extension host process:

| File | Responsibility |
|------|---------------|
| `extension.ts` | `activate()` / `deactivate()` entry point |
| `backend.ts` | Spawn Rust binary, manage lifecycle, send/receive JSON-RPC |
| `webview-provider.ts` | Create webview panel, inject HTML with CSP, relay messages |
| `commands.ts` | Register VS Code commands (`gitGraphEnhanced.show`, etc.) |
| `config.ts` | Read extension settings from `vscode.workspace.getConfiguration` |
| `types.ts` | TypeScript interfaces matching Rust serde structs |

The extension host is a relay — it owns no business logic. It spawns the backend, forwards webview requests as JSON-RPC calls, and pushes results back to the webview.

### Webview (`webview/`)

HTML + CSS + TypeScript loaded in a VS Code webview panel:

| File | Responsibility |
|------|---------------|
| `index.html` | Shell with CSP meta tag, nonce-based script loading |
| `src/main.ts` | Entry point, initializes renderer and message handler |
| `src/graph-renderer.ts` | Canvas-based DAG rendering with virtual scrolling |
| `src/message-handler.ts` | `postMessage` bridge to extension host |
| `src/theme.ts` | Reads VS Code CSS custom properties for theming |
| `styles/main.css` | Layout, scrollbar styling, panel structure |

Canvas is used instead of SVG/DOM because SVG nodes become expensive at 10k+ commits. Canvas renders only the visible viewport via virtual scrolling.

## Communication

### Extension Host ↔ Rust Backend (JSON-RPC over stdin/stdout)

```
Extension Host                          Rust Backend
     │                                       │
     │──── {"jsonrpc":"2.0","id":1,  ───────►│
     │      "method":"getCommits",           │
     │      "params":{...}}                  │
     │                                       │
     │◄─── {"jsonrpc":"2.0","id":1,  ────────│
     │      "result":{"commits":[...]}}      │
     │                                       │
```

- One JSON object per line (newline-delimited)
- Request IDs are monotonically increasing integers
- The extension host maintains a pending request map (id → Promise resolver)
- stderr is for Rust logging only — never parsed as protocol

Methods:

| Method | Purpose |
|--------|---------|
| `getCommits` | Paginated commit log |
| `getGraph` | Pre-computed graph layout (nodes + edges) |
| `getBranches` | All branches + HEAD indicator |
| `getTags` | All tags |
| `getCommitDetail` | Full commit with changed files |
| `getDiff` | Diff for a commit or specific file |
| `search` | Search by message, author, or hash |

### Extension Host ↔ Webview (postMessage)

```
Webview                              Extension Host
   │                                       │
   │──── {type:"ready"}  ────────────────►│
   │                                       │
   │◄─── {type:"updateGraph",  ───────────│
   │      payload:{commits,nodes,edges}}   │
   │                                       │
   │──── {type:"requestCommitDetail",  ──►│
   │      payload:{commitId:"abc123"}}     │
   │                                       │
```

- All messages: `{ type: string, payload?: unknown }`
- Webview sends requests (e.g., `requestCommits`, `search`)
- Extension sends data updates (e.g., `updateGraph`, `updateCommitDetail`)
- Webview cannot access filesystem, clipboard, or network — the extension host bridges these

## Data Flow: User Opens Graph

```
1. User runs "Git Graph Enhanced: Show" command
2. extension.ts → commands.ts registers the command
3. webview-provider.ts creates a WebviewPanel with CSP
4. backend.ts spawns the Rust binary as a child process
5. Webview loads, sends { type: "ready" }
6. Extension host sends JSON-RPC getCommits + getBranches to Rust
7. Rust reads repo via gix, returns commits + branches
8. Extension host sends JSON-RPC getGraph with commit IDs
9. Rust computes DAG layout, returns nodes + edges
10. Extension host posts { type: "updateGraph", payload: {...} } to webview
11. graph-renderer.ts draws commit dots + branch lines on Canvas
```

## Graph Layout Algorithm

Runs in Rust (`git-graph-core`), not in the webview. The webview receives pre-computed positions.

Input: list of commits with parent IDs (topological order, newest first)
Output: `GraphNode[]` (commitId, column, color) + `GraphEdge[]` (from/to commit+column, color)

Algorithm (greedy column assignment):
1. Process commits in topological order
2. Assign each commit to the lowest available column
3. When a branch merges, free its column for reuse
4. Route edges between parent/child commits
5. Assign colors per branch (cycle through a palette)

This keeps layout math out of JavaScript entirely.

## Backend Process Lifecycle

### Spawn Strategy

Lazy spawn — the Rust binary is started on first use (when the user opens the graph), not on extension activation. This keeps extension startup fast (< 500ms target) and avoids wasting resources if the user never opens the graph.

```
activate() → register commands only (no spawn)
"Show Graph" command → spawn backend, then create webview
```

### Graceful Shutdown

On `deactivate()` or webview panel close:
1. Send a `shutdown` JSON-RPC notification (no `id`, no response expected)
2. Wait up to 2s for the process to exit
3. If still alive, send SIGTERM
4. If still alive after 1s, send SIGKILL

The Rust server installs a handler for the `shutdown` notification that breaks the stdin read loop and exits cleanly.

### Crash Recovery

If the Rust process exits unexpectedly (non-zero exit code, signal):
1. Log the exit code and any stderr output to the output channel
2. Show a notification: "Git Graph backend crashed. Restarting..."
3. Respawn the binary (max 3 retries within 60s, then give up)
4. Re-send the current state request (getCommits for the active repo)
5. If retries exhausted, show error with "Open Output" action

### Health Check

No keepalive/ping mechanism in Phase 1. The extension detects a dead process via:
- `child.on('exit')` event
- Request timeout (see below)

A `ping`/`pong` method may be added later if silent death becomes an issue in practice.

### Fallback on Binary Failure

If the binary fails to spawn (missing, wrong architecture, permission denied):
1. Show an error notification with the specific failure reason
2. Suggest reinstalling the extension
3. The extension remains active but the graph command shows an error panel

## IPC Robustness

### Stdin/Stdout Buffering

Newline-delimited JSON framing. The extension host reads stdout line-by-line:
- Buffer incoming data, split on `\n`
- Only parse complete lines (ignore partial reads)
- Each JSON-RPC response is exactly one line — the Rust server must never emit pretty-printed JSON to stdout

The Rust server flushes stdout after every response line (`BufWriter` with explicit `flush()` after each write).

### Request Timeout

Every JSON-RPC request has a 30s timeout (configurable via `gitGraphEnhanced.requestTimeout`). If a response isn't received:
1. Reject the pending Promise with a timeout error
2. Log a warning — the backend may be stuck
3. Do NOT kill the process (it may recover on the next request)

For known-slow operations (initial load of large repos), the timeout is extended to 120s.

### Cancellation

Phase 1: no cancellation support. In-flight requests run to completion.

Future: add JSON-RPC `$/cancelRequest` notification. The Rust server can check a cancellation flag between pagination chunks.

### Concurrent Request Handling

The Rust server processes requests sequentially (single-threaded stdin read loop). This is intentional for Phase 1 — it avoids concurrent `gix` access complexity.

The extension host can send multiple requests, but they queue in the server's stdin buffer and are processed in order. The pending request map on the TypeScript side handles out-of-order responses (matched by `id`), but in practice responses arrive in request order.

Future: async dispatch with `tokio::spawn` per request, with a shared `gix::Repository` behind an `Arc<Mutex<>>` or by opening separate handles.

## File Watching & Change Detection

The extension host watches for `.git` directory changes to detect external mutations:

```
vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,refs/**,index}')
```

On change:
1. Debounce (500ms) to batch rapid changes (e.g., `git rebase` touches many refs)
2. Send `getCommits` + `getBranches` to refresh the graph
3. Post `updateGraph` to the webview

This catches: commits, branch switches, pulls, fetches, rebases, and index changes done outside the extension (terminal, other tools).

## State Persistence

Use VS Code's `globalState` and `workspaceState` for session persistence:

| State | Storage | Data |
|-------|---------|------|
| Last active repo path | workspaceState | String |
| Scroll position per repo | workspaceState | `{ repoPath: scrollTop }` |
| Column widths | globalState | `{ date, author, message }` |
| Last search query | workspaceState | String |
| Code review state | workspaceState | `{ commitId: { files: reviewed[] } }` |

State is saved on webview hide/dispose and restored on re-open.

## Multi-Repo Support

### Discovery

On activation, scan the workspace for git repositories:
1. Check each workspace folder root for `.git`
2. Optionally scan one level deep (`gitGraphEnhanced.maxDepthOfRepoSearch`, default 1)
3. Present a repo picker if multiple repos found

### Multiple Instances

Phase 1: single graph panel. If the user opens the graph while one is active, focus the existing panel.

Future: multiple graph tabs, each bound to a different repo. Each tab has its own backend connection (or the backend supports a `repoPath` param on every request — which it already does).

## Canvas Rendering Concerns

### Accessibility

Canvas is an opaque bitmap — no DOM nodes for screen readers. Mitigation strategy:

1. Maintain a hidden DOM "accessibility tree" that mirrors the visible commit list
2. Each visible commit gets a hidden `<div role="row">` with `aria-label` containing commit info
3. Keyboard focus moves through the hidden DOM; Canvas highlights the focused commit
4. Screen readers announce commit details from the hidden elements

This is the same pattern used by VS Code's terminal renderer and Monaco editor.

### Hit Testing

No DOM events on Canvas elements. Hit testing is index-based:
- Click Y position → `Math.floor((scrollTop + clickY) / ROW_HEIGHT)` → commit index
- Click X position → check if within graph column area (branch lines) or text area (message, author)
- Hover uses the same math, throttled to `mousemove` with `requestAnimationFrame`

### High-DPI / Retina

Scale the Canvas backing store by `window.devicePixelRatio`:

```
canvas.width = displayWidth * devicePixelRatio;
canvas.height = displayHeight * devicePixelRatio;
canvas.style.width = displayWidth + 'px';
canvas.style.height = displayHeight + 'px';
ctx.scale(devicePixelRatio, devicePixelRatio);
```

Listen for `matchMedia('(resolution: ...)').addEventListener('change', ...)` to handle DPI changes (e.g., dragging window between monitors).

### Text Selection & Copy

Canvas text can't be selected. Workaround:
- Commit messages, SHAs, author names are copyable via context menu → `copyToClipboard` message
- The commit detail panel (DOM-based, not Canvas) allows normal text selection
- Double-click a commit row → open detail panel where text is selectable

### Tooltips

Manual tooltip positioning. On hover over a graph element:
1. Calculate tooltip position from mouse coordinates
2. Show a positioned `<div>` overlay on top of the Canvas
3. Hide on mouseout with a small delay (150ms) to prevent flicker

### Right-to-Left Text

Canvas `fillText` doesn't handle BiDi. For Phase 1, we render LTR only. Future: use `ctx.direction = 'inherit'` and the `Intl.Segmenter` API for proper BiDi support if demand exists.

### Keyboard Navigation

Implement from scratch since Canvas has no tab order:
1. The Canvas container is a focusable `<div tabindex="0">`
2. Arrow keys move the selected commit (up/down) or scroll (page up/down)
3. Enter opens commit detail, Escape closes it
4. A visible focus ring is drawn on the Canvas around the selected row
5. The hidden accessibility DOM stays in sync with keyboard selection

## Protocol Evolution

### Schema Versioning

The extension host sends an `initialize` request as the first message after spawning the backend:

```json
{ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": 1 } }
```

The backend responds with its supported version. If incompatible, the extension shows "Please update the extension" and refuses to proceed. This handles the case where the extension updates but the old binary is cached.

### Notifications (Backend → Extension)

JSON-RPC notifications (no `id` field) for backend-initiated events:

| Notification | Purpose |
|-------------|---------|
| `$/log` | Structured log message (displayed in output channel) |

Future notifications: `$/fileChanged` (if the backend watches files directly), `$/progress` (long-running operation progress).

### Streaming / Chunked Delivery

Phase 1: single JSON response per request. For 500 commits this is ~200KB — fine.

Future for 100k+ commits: the backend sends multiple `appendCommits` responses with the same `id`, with a `done: true` flag on the last chunk. The extension host forwards each chunk to the webview as `appendCommits` messages.

### Binary Protocol

JSON is the protocol for all phases. MessagePack or similar is not planned unless profiling shows serialization as a bottleneck. JSON is debuggable (pipe stdin/stdout to a file), and `serde_json` is fast enough for the expected payload sizes.

## Security

- Webview uses strict CSP: `default-src 'none'`, nonce-based scripts, no `unsafe-inline`/`unsafe-eval`
- All local resources loaded via `webview.asWebviewUri()`
- Git data (commit messages, author names) rendered via Canvas `fillText` — not parsed as HTML
- Any HTML rendering of git data uses explicit escaping
- Rust backend validates repo paths — rejects paths outside the workspace
- Rust binary has no network access and performs no file writes

## Performance Strategy

| Technique | Layer | Purpose |
|-----------|-------|---------|
| Virtual scrolling | Webview | Only render ~50 visible rows |
| `requestAnimationFrame` | Webview | Batch Canvas redraws |
| Pagination | Rust + Extension | Load commits in pages (default 500) |
| Pre-computed layout | Rust | Zero layout math in JavaScript |
| Object cache | Rust | `gix` object cache for repeated lookups |
| Debounced search | Webview | 300ms debounce on search input |
| Layout caching | Extension | Cache graph layout, recompute only on data change |

Target: < 2s initial render for 10k commits, 60fps scrolling, < 200MB memory for 100k+ commits.

## Logging & Error UX

### Logging

| Layer | Mechanism | Destination |
|-------|-----------|-------------|
| Rust backend | `tracing` crate → stderr | Extension host reads stderr, forwards to output channel |
| Extension host | VS Code `OutputChannel` ("Git Graph Enhanced") | Output panel |
| Webview | `postMessage({ type: 'log', payload })` → extension host | Output channel (not `console.log`) |

Log levels: error, warn, info, debug. Default level: info. Configurable via `gitGraphEnhanced.logLevel`.

### Error UX

Errors are surfaced in three ways depending on severity:

| Severity | UX | Example |
|----------|-----|---------|
| Fatal | `vscode.window.showErrorMessage` with action buttons | Backend binary missing, spawn failure |
| Recoverable | `vscode.window.showWarningMessage` | Request timeout, backend crash (auto-restarting) |
| Inline | Error message rendered in webview panel | Invalid repo path, empty repo |

All errors are also logged to the output channel with full context. The "Open Output" action is included on error notifications.

### Activation Events

The extension uses scoped activation, not eager `*`:

```json
{
    "activationEvents": [
        "onCommand:gitGraphEnhanced.show",
        "onView:gitGraphEnhanced.graphView"
    ]
}
```

This avoids loading the extension until the user explicitly requests it.

## Diff Strategy

Use VS Code's native diff editor via `TextDocumentContentProvider`:
- Register a URI scheme `git-graph-enhanced` for git content at specific revisions
- The Rust backend provides file content at a given commit via a `getFileContent` RPC method
- Opening a diff: `vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)`

This gives users the full VS Code diff experience (inline, side-by-side, minimap, word-level highlighting) without building a custom diff viewer.

## Auth & Credentials

For Phase 1 (read-only operations): not needed. `gix::open` reads the local repo without authentication.

For future write operations (push, fetch, pull):
- Use `GIT_ASKPASS` environment variable pointing to a helper script that calls back to the extension host
- The extension host uses `vscode.window.showInputBox` to prompt for passwords/passphrases
- SSH key passphrase: same mechanism via `SSH_ASKPASS`
- Credential caching: defer to the user's git credential helper (`credential.helper` config)

## Submodule & Encoding

### Submodules

Phase 1: submodules are not traversed. The graph shows the parent repo only. Submodule entries appear as changed files with type "submodule" in commit details.

Future: option to discover and open submodule repos as separate graph tabs.

### File Encoding

`gix` returns file content as raw bytes. For diff display:
1. Attempt UTF-8 decode
2. If invalid UTF-8, show "(binary file)" placeholder
3. Future: detect encoding via BOM or heuristics, convert with `encoding_rs` crate

## Build & Packaging

### Bundle Structure

```
esbuild.mjs          → bundles src/ into dist/extension.js
                      → bundles webview/src/ into dist/webview.js
scripts/build-rust.sh → cargo build --release for target platform
vsce package          → assembles .vsix with extension + webview + Rust binary
```

### Cross-Compilation

CI matrix strategy — each platform builds natively on its own runner:

| Target | CI Runner |
|--------|-----------|
| `aarch64-apple-darwin` | `macos-14` (M1) |
| `x86_64-apple-darwin` | `macos-13` (Intel) |
| `x86_64-unknown-linux-gnu` | `ubuntu-latest` |
| `x86_64-pc-windows-msvc` | `windows-latest` |

Native builds avoid cross-compilation toolchain complexity. Each runner produces a platform-specific `.vsix`.

### Platform-Specific .vsix

VS Code supports platform-specific extensions via the `target` field in `package.json`. Each CI job produces a separate `.vsix` for its platform. Users download only their platform's binary.

### Binary Size Optimization

Rust release profile:

```toml
[profile.release]
lto = true
codegen-units = 1
strip = true
opt-level = "z"    # Optimize for size
```

Target: < 5MB stripped binary. The full `.vsix` (binary + JS + HTML) should be < 15MB.

### Binary Signing

Phase 1: unsigned binaries. macOS Gatekeeper and Windows SmartScreen may warn users.

Future: sign macOS binaries with an Apple Developer certificate, sign Windows binaries with Authenticode. This requires paid certificates and CI secrets management.

### Update Atomicity

When the extension updates:
1. VS Code replaces the extension directory atomically
2. On next activation, the new binary is spawned
3. If the old binary is still running (panel open during update), it continues until the panel is closed
4. The `initialize` handshake (protocol version check) catches version mismatches

## Testing Strategy

### Rust

| Type | Tool | Scope |
|------|------|-------|
| Unit tests | `cargo test` | Core crate — commit parsing, graph layout, filtering |
| Integration tests | `cargo test` | Server crate — send JSON-RPC to stdin, verify stdout |

Test fixtures: small git repos created in `tests/fixtures/` via shell scripts or `gix` programmatically. Edge cases: octopus merges, detached HEAD, empty repos, shallow clones, repos with 10k+ commits (generated).

### TypeScript

| Type | Tool | Scope |
|------|------|-------|
| Unit tests | `vitest` | Backend IPC parsing, message handling, config |
| Extension tests | `@vscode/test-electron` | Command registration, webview creation |

### Webview

Canvas rendering is hard to unit test. Strategy:
1. Unit test the data layer (message handler, virtual scroll math, hit testing logic) with `vitest`
2. Visual regression testing deferred to Phase 4 — screenshot comparison with Playwright

### Performance Benchmarks

Deferred to Phase 4. Benchmark harness:
- Fixture repos: linux kernel (~1.2M commits), chromium (~1M commits), or generated repos
- Measure: time to first render, scroll FPS, memory usage
- Run in CI on a consistent runner, track regressions

## Status Bar

A status bar item shows "Git Graph" with a git icon. Clicking it runs `gitGraphEnhanced.show`. The item is visible when a workspace contains a git repository.

```typescript
const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
statusBar.text = "$(git-branch) Git Graph";
statusBar.command = "gitGraphEnhanced.show";
statusBar.show();
```

## Keybindings

Default keybinding: none registered. Users can bind `gitGraphEnhanced.show` to their preferred shortcut. This avoids conflicts with VS Code defaults and other extensions.

Within the webview, keyboard shortcuts are scoped to the Canvas container and don't leak to VS Code:
- Up/Down: navigate commits
- Enter: open commit detail
- Escape: close detail panel / clear search
- Ctrl+F / Cmd+F: focus search input
- Ctrl+C / Cmd+C: copy selected commit SHA
