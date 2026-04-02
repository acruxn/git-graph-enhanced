# AGENTS.md

> Cross-tool AI agent instructions. For detailed guidance, see `.kiro/steering/`.

## About

Git Graph Enhanced — a high-performance VS Code extension for git history visualization. Original implementation (MIT license). Rust backend + TypeScript extension + Canvas webview.

## CRITICAL: Intellectual Property

This is an original implementation. Do not copy code verbatim from GPL-licensed extensions — license incompatibility.

## Setup Commands

```bash
# Rust
cargo build --workspace
cargo test --workspace

# TypeScript
npm install
node esbuild.mjs

# Run extension (VS Code)
# Press F5 in VS Code to launch Extension Development Host

# Package
npx @vscode/vsce package
```

## Code Style

- Rust: `rustfmt` + `clippy`, thiserror for library errors, anyhow for server
- TypeScript: strict mode, no `any`, named exports only
- VS Code extension: disposable pattern, output channels for logging
- Git: `type(scope): description` — conventional commits

## Project Structure

```
├── crates/
│   ├── git-graph-core/       # Rust library: git ops, graph layout
│   └── git-graph-server/     # Rust binary: JSON-RPC stdin/stdout
├── src/                      # TypeScript: VS Code extension host
├── webview/                  # HTML/CSS/TS: Canvas graph UI
├── scripts/                  # Build & dev scripts
└── docs/                     # Documentation
```

## Architecture

```
Webview (Canvas) ←→ Extension Host (TS) ←→ Rust Backend (JSON-RPC)
```

## Naming

- `git-graph-enhanced` — kebab-case (extension ID, npm)
- `git_graph_enhanced` — snake_case (Rust crate)
- `GitGraphEnhanced` — PascalCase (TypeScript classes)
- `gitGraphEnhanced` — camelCase (TypeScript functions, VS Code settings)

## Boundaries

- Do NOT copy code verbatim from GPL-licensed extensions — license incompatibility
- Do NOT use `unwrap()` or `expect()` in Rust library code — propagate errors with `?`
- Do NOT use `any` in TypeScript — use `unknown` and narrow
- Do NOT use `console.log` in extension code — use VS Code output channels
- Do NOT use `println!` in Rust library code — use `tracing` or `log`
- Do NOT use `innerHTML` with unsanitized git data — use Canvas text or escape HTML
- Do NOT hardcode values that should be configurable

## Verification

```bash
cargo check --workspace          # Type check Rust
cargo test --workspace           # Run Rust tests
cargo clippy --workspace         # Lint Rust
cargo fmt --all -- --check       # Check Rust formatting
npx vitest run                   # Run TypeScript tests
node esbuild.mjs                 # Build extension
```
