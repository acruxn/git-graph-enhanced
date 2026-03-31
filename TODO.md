# Git Graph Enhanced — TODO

## Phase 1: Foundation (current)

- [ ] Initial commit — planning files
- [ ] Alpha: Rust workspace + git-graph-core + git-graph-server scaffold
- [ ] Bravo: Extension host scaffold
- [ ] Charlie: Webview UI scaffold
- [ ] Delta: Build tooling + infra scaffold
- [ ] Integration test — end-to-end wiring
- [ ] Phase 1 commit + tag v0.1.0-alpha

## Phase 2: Usable Graph

- [ ] DAG layout algorithm (column assignment, edge routing, color assignment)
- [ ] Bezier curve edges + branch/tag badges
- [ ] Virtual scrolling (render visible viewport only)
- [ ] High-DPI / Retina Canvas scaling (devicePixelRatio)
- [ ] Canvas hit testing (click/hover → commit index)
- [ ] Commit detail panel (click → author, date, message, changed files)
- [ ] `getCommitDetail` RPC method
- [ ] VS Code theme color integration
- [ ] Keyboard navigation in graph (up/down/enter/escape)
- [ ] Hidden accessibility DOM mirroring visible commits

## Phase 3: Interactive

- [ ] `search` + `getDiff` RPC methods
- [ ] Search/filter UI (debounced input)
- [ ] Changed files list in commit detail
- [ ] Diff via VS Code native diff editor (TextDocumentContentProvider)
- [ ] `getFileContent` RPC method for diff URIs
- [ ] .git file watcher — detect external commits, branch switches, pulls
- [ ] Backend crash recovery — auto-restart with retry limit
- [ ] Request timeout (30s default, 120s for large ops)
- [ ] Graceful backend shutdown on deactivate
- [ ] State persistence — scroll position, last repo, column widths (workspaceState)
- [ ] Status bar item ("Git Graph" button)
- [ ] Keyboard navigation commands
- [ ] Context menu registration
- [ ] Copy to clipboard bridge
- [ ] Canvas tooltip overlay (hover → positioned div)
- [ ] Output channel logging (extension host + Rust stderr forwarding)

## Phase 4: Polish & Ship

- [ ] Cross-platform CI matrix (macOS arm64/x64, Linux x64, Windows x64)
- [ ] Platform-specific .vsix packaging
- [ ] Binary size optimization (lto, strip, codegen-units=1, opt-level=z)
- [ ] CI/CD pipeline for releases
- [ ] Multi-repo discovery — scan workspace folders for .git
- [ ] `initialize` handshake — protocol version negotiation
- [ ] Performance profiling on large repos (linux kernel, chromium)
- [ ] Performance benchmark harness in CI
- [ ] Memory optimization
- [ ] Visual regression testing (Playwright screenshots)
- [ ] Test fixture repos (octopus merges, empty repos, shallow clones, 10k+ commits)
- [ ] README with screenshots + marketplace listing
- [ ] Settings UI + graph style options
- [ ] Extension settings schema (contributes.configuration)

---

## Feature Backlog

Features below are post-v1.0, roughly prioritized within each category.

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
- [ ] Search across unloaded commits — full-repo search via Rust backend (#13)
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

### Infrastructure (post-v1.0)

- [ ] JSON-RPC cancellation — `$/cancelRequest` for in-flight requests (#66)
- [ ] Streaming/chunked delivery for 100k+ commit responses (#64)
- [ ] Backend-initiated notifications — `$/fileChanged`, `$/progress` (#65)
- [ ] Async request dispatch in Rust server (tokio::spawn per request) (#8)
- [ ] Binary signing — macOS Gatekeeper, Windows Authenticode (#70)
- [ ] Non-UTF-8 file encoding support in diffs (encoding_rs) (#14)
- [ ] Submodule discovery — open submodule repos as separate tabs (#13)
- [ ] RTL/bidirectional text support in Canvas (#61)
- [ ] Opt-in telemetry (#82)
- [ ] Migration path from original Git Graph (import settings) (#83)
