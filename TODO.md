# Git Graph Enhanced — TODO

## ✅ Phase 1: Foundation — v0.1.0-alpha

- [x] Rust workspace + git-graph-core + git-graph-server
- [x] Extension host (package.json, backend IPC, webview provider, commands)
- [x] Webview UI (Canvas renderer, message handler, theme manager)
- [x] Build tooling (esbuild, build-rust.sh, CI, LICENSE, README)

## ✅ Phase 2: Usable Graph

- [x] DAG layout algorithm (column assignment, edge routing, color assignment)
- [x] Bezier curve edges + branch/tag badges
- [x] Virtual scrolling (render visible viewport only)
- [x] High-DPI / Retina Canvas scaling (devicePixelRatio)
- [x] Canvas hit testing (click/hover → commit index)
- [x] Commit detail panel (click → author, date, message, changed files)
- [x] `getCommitDetail` + `getTags` RPC methods
- [x] VS Code theme color integration
- [x] Keyboard navigation (arrows, Home/End, PageUp/Down, Enter, Escape)
- [x] Hidden accessibility DOM mirroring visible commits

## ✅ Phase 3: Interactive

- [x] `search` + `getDiff` + `getFileContent` RPC methods
- [x] Search/filter UI (debounced 300ms, type selector)
- [x] Diff via VS Code native diff editor (TextDocumentContentProvider)
- [x] .git file watcher (debounced 500ms refresh)
- [x] Backend crash recovery (3 retries in 60s)
- [x] Request timeout (30s configurable)
- [x] Graceful backend shutdown (notification + 2s kill)
- [x] State persistence (scroll position via workspaceState)
- [x] Status bar item + context menu + clipboard bridge
- [x] Canvas tooltip overlay + right-click context menu
- [x] Output channel logging (extension host + Rust stderr)

## ✅ Phase 4: Polish & Ship — v0.1.0

- [x] Cross-platform CI matrix (macOS arm64/x64, Linux x64, Windows x64)
- [x] Platform-specific .vsix packaging
- [x] Binary size optimization (lto, strip, codegen-units=1, opt-level=z)
- [x] Tag-triggered release workflow
- [x] Multi-repo discovery (workspace scanning, quick pick)
- [x] `initialize` handshake (protocol version negotiation)
- [x] `shutdown` notification handling
- [x] Extension settings schema (contributes.configuration)
- [x] README with features, setup, settings, keybindings

## Phase 4 deferred (not blocking v0.1.0)

- [ ] Performance profiling on large repos (linux kernel, chromium)
- [ ] Performance benchmark harness in CI
- [ ] Memory optimization
- [ ] Visual regression testing (Playwright screenshots)
- [ ] Test fixture repos (octopus merges, empty repos, shallow clones, 10k+ commits)

---

## Feature Backlog

Post-v1.0, roughly prioritized within each category.

### Graph Rendering & Layout

- [ ] Persistent/dedicated branch columns — pin main/develop to fixed columns (#1)
- [ ] Branch color on commit dots/rows, not just graph lines (#2)
- [ ] Branch line highlighting on click — thicken/highlight full path (#3)
- [ ] Muted merge commits / non-ancestor commits — visual de-emphasis (#4)
- [ ] Configurable commit ordering — topological, date, author-date sort (#5)
- [ ] Configurable column visibility — show/hide and resize Date, Author, Commit (#6)
- [ ] Sticky column headers — keep headers visible while scrolling (#7)
- [ ] Markdown rendering in commit messages — bold, italics, inline code (#8)
- [ ] Emoji shortcode rendering — :sparkles: → ✨, gitmoji support (#9)
- [ ] Fetch avatars — Gravatar-based author/committer avatars (#10)

### Search & Filtering

- [ ] Dedicated author filter — hide non-matching commits from graph (#11)
- [ ] Filter by tags — show only tagged commits or commits between tags (#12)
- [ ] Reflog inclusion — option to show reflog-only commits (#14)

### Commit Operations

- [ ] Multi-commit selection / batch operations — bulk cherry-pick, drop, squash (#15)
- [ ] Fixup/squash commit creation + autosquash (#16)
- [ ] Interactive rebase via VS Code editor — rebase todo in editor tab (#17)
- [ ] Merge/rebase/cherry-pick --abort from graph (#18)
- [ ] Commit comparison view — CTRL+click two commits to diff (#19)
- [ ] Open file at specific revision (#20)
- [ ] Commit signature/GPG verification indicator (#21)

### Branch Operations

- [ ] Delete multiple branches at once — batch cleanup (#22)
- [ ] PR creation integration — GitHub, GitLab, Bitbucket + custom providers (#23)

### Remote & Environment

- [ ] Remote management widget — view, add, edit, delete, fetch & prune (#24)
- [ ] SSH key passphrase prompting (#25)
- [ ] Remote Tunnel / Dev Container / Remote SSH support (#26)
- [ ] Integrated terminal shell — open terminal at repo path (#27)

### UI & UX

- [ ] Side panel / minimal graph view — compact sidebar graph (#28)
- [ ] Multiple graph instances / tabs (#29)
- [ ] Export graph as image — SVG/PNG/JPG (#30)
- [ ] Auto-open graph on workspace load (#31)
- [ ] Enhanced accessibility mode — A/M/D/R/U indicators for color-blind users (#33)
- [ ] Branch line highlighting on hover — tooltip with branches/tags (#34)

### Configuration & Collaboration

- [ ] Issue linking — regex-based issue numbers → clickable hyperlinks (#35)
- [ ] Code review tracking — mark files reviewed, persists across sessions (#36)
- [ ] Exportable repo-level config — team-shared graph settings (#37)
- [ ] Mailmap support — respect .mailmap for author normalization (#38)
- [ ] Custom branch glob patterns — user-defined branch groupings (#39)

### Stash

- [ ] Stash keyboard navigation — CTRL+S / CTRL+SHIFT+S to jump between stashes (#40)
- [ ] Improved stash discovery — visual indicators for stash locations (#41)

### Infrastructure

- [ ] JSON-RPC cancellation — `$/cancelRequest` for in-flight requests (#66)
- [ ] Streaming/chunked delivery for 100k+ commit responses (#64)
- [ ] Backend-initiated notifications — `$/fileChanged`, `$/progress` (#65)
- [ ] Async request dispatch in Rust server (tokio::spawn per request)
- [ ] Binary signing — macOS Gatekeeper, Windows Authenticode (#70)
- [ ] Non-UTF-8 file encoding support in diffs (encoding_rs)
- [ ] Submodule discovery — open submodule repos as separate tabs
- [ ] RTL/bidirectional text support in Canvas
- [ ] Opt-in telemetry
- [ ] Migration path from other git graph extensions (import settings)
