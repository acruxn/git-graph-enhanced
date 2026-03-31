# AGENTS.md

> Cross-tool AI agent instructions. For detailed guidance, see `.kiro/steering/`.

## About

Git Graph Enhanced — a high-performance VS Code extension for git history visualization. Clean-room rewrite (MIT license). Rust backend + TypeScript extension + Canvas webview.

## CRITICAL: Clean-Room Rewrite

This is a clean-room rewrite. Do NOT reference the original Git Graph extension (GPL-3.0) source code. All implementations must be original, designed from first principles.

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

- Do NOT reference, copy, or derive from the original Git Graph extension source (GPL-3.0)
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
