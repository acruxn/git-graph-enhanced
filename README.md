# Git Graph Enhanced

High-performance git history visualization for VS Code, powered by Rust.

> ⚠️ Early development — not yet published on the marketplace.

## Features

- Interactive commit graph with branch topology
- Rust backend for native performance on large repositories
- Canvas-based rendering with virtual scrolling

## Development

### Prerequisites

- Rust toolchain (rustup)
- Node.js 18+
- VS Code 1.85+

### Build

```bash
npm install
cargo build --workspace
node esbuild.mjs
bash scripts/build-rust.sh
```

### Run

Press F5 in VS Code to launch the Extension Development Host.

## License

MIT
