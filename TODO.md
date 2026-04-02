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

## v0.1.0 Marketplace Release — Blockers

These must ship before publishing to the VS Code marketplace.

Previous round completed: toolbar header, hover popover, theme system, commit detail polish (GPG badge + autolinks + combined labels in detail panel).

### Alpha: Basic git write operations
- [ ] `src/git-operations.ts` — spawn git commands (checkout, branch, tag) from extension host
- [ ] Context menu: Checkout Branch, Checkout Commit (detached), Create Branch, Create Tag
- [ ] Message handlers in `webview-provider.ts` for checkout/createBranch/createTag
- [ ] Confirmation dialogs (branch name input, tag name input)
- [ ] Auto-refresh graph after each write operation

### Bravo: Toolbar search + branch state indicator
- [ ] Move search input into toolbar center section (HTML + CSS + wiring)
- [ ] Add `getBranchState` RPC to Rust backend (ahead/behind counts vs upstream)
- [ ] Display current branch name + ahead/behind pills in toolbar left section
- [ ] Wire branch state into webview on init + refresh

### Charlie: Graph visual polish
- [ ] Extend merge commit muting to SHA + date columns (currently only message + author)
- [ ] Combined branch/remote labels in graph Canvas badges (detail panel already has this)
- [ ] GPG signature badge in graph row Canvas (detail panel already has this)

### Delta: Fetch button + auto-refresh
- [ ] Fetch button in toolbar (executes `git fetch --prune` via extension host)
- [ ] "Last fetched X ago" tooltip on fetch button
- [ ] Auto-refresh graph after any git write operation completes (checkout, branch, tag, fetch)

## Phase 4 deferred (not blocking v0.1.0)

- [ ] Performance profiling on large repos (linux kernel, chromium)
- [ ] Performance benchmark harness in CI
- [ ] Memory optimization
- [ ] Visual regression testing (Playwright screenshots)
- [ ] Test fixture repos (octopus merges, empty repos, shallow clones, 10k+ commits)

---

## v0.2.0 Backlog

Post-marketplace-launch, roughly prioritized by impact/effort.

### High Priority
- [ ] Canvas minimap — condensed timeline with commit density bars + markers (#minimap)
- [ ] Structured search operators — `@:author`, `#:sha`, `file:path`, `after:`, `before:` (#search)
- [ ] Full git write operations — merge, rebase, cherry-pick, revert, reset (#write-ops)
- [ ] Stash management — apply, pop, drop, create from graph (#stash)

### Medium Priority
- [ ] Sidebar icon bar — branches/tags/stashes counts with codicon icons (#sidebar)
- [ ] Column resize — draggable dividers in Canvas header (#column-resize)
- [ ] Worktree support — create/manage/remove from graph (#worktrees)
- [ ] Gravatar avatars — fetch and cache author avatars (#avatars)
- [ ] Autolinks — regex-based issue/PR linking in commit messages (#autolinks)
- [ ] Search autocomplete + history (#search-autocomplete)
- [ ] Arrow key branch-tracking navigation — Ctrl+Arrow follows branch (#keyboard)

### Lower Priority
- [ ] Pull/Push buttons with ahead/behind counts (#pull-push)
- [ ] Author filter covering all reachable authors (#author-filter)
- [ ] Configurable dialog defaults for merge/cherry-pick options (#dialog-defaults)
- [ ] Scroll position restore on tab switch (#scroll-restore)
- [ ] Auto-load more commits on scroll (#auto-load)

### Feature Backlog (original)

Post-v1.0, roughly prioritized within each category.

### Graph Rendering & Layout

- [ ] Persistent/dedicated branch columns — pin main/develop to fixed columns (#1)
- [ ] Branch color on commit dots/rows, not just graph lines (#2)
- [ ] Branch line highlighting on click — thicken/highlight full path (#3)
- [ ] Muted merge commits / non-ancestor commits — visual de-emphasis (#4)
- [x] Configurable commit ordering — topological, date, author-date sort (#5)
- [ ] Configurable column visibility — show/hide and resize Date, Author, Commit (#6)
- [ ] Sticky column headers — keep headers visible while scrolling (#7)
- [ ] Markdown rendering in commit messages — bold, italics, inline code (#8)
- [ ] Emoji shortcode rendering — :sparkles: → ✨, gitmoji support (#9)
- [ ] Fetch avatars — Gravatar-based author/committer avatars (#10)

### Search & Filtering

- [x] Dedicated author filter — hide non-matching commits from graph (#11)
- [ ] Filter by tags — show only tagged commits or commits between tags (#12)
- [ ] Reflog inclusion — option to show reflog-only commits (#14)

### Commit Operations

- [ ] Multi-commit selection / batch operations — bulk cherry-pick, drop, squash (#15)
- [ ] Fixup/squash commit creation + autosquash (#16)
- [ ] Interactive rebase via VS Code editor — rebase todo in editor tab (#17)
- [ ] Merge/rebase/cherry-pick --abort from graph (#18)
- [x] Commit comparison view — CTRL+click two commits to diff (#19)
- [ ] Open file at specific revision (#20)
- [~] Commit signature/GPG verification indicator (#21)

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
