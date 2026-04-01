#!/usr/bin/env bash
set -euo pipefail

FIXTURES_DIR="tests/fixtures"
rm -rf "$FIXTURES_DIR"
mkdir -p "$FIXTURES_DIR"

# 1. Simple linear repo
DIR="$FIXTURES_DIR/linear"
mkdir -p "$DIR" && cd "$DIR"
git init
git config user.email "test@test.com" && git config user.name "Test"
for i in $(seq 1 10); do git commit --allow-empty -m "commit $i"; done
cd -

# 2. Merge repo
DIR="$FIXTURES_DIR/merge"
mkdir -p "$DIR" && cd "$DIR"
git init
git config user.email "test@test.com" && git config user.name "Test"
git commit --allow-empty -m "initial"
git checkout -b feature
git commit --allow-empty -m "feature work"
git checkout main 2>/dev/null || git checkout master
git merge feature --no-ff -m "merge feature"
cd -

# 3. Octopus merge
DIR="$FIXTURES_DIR/octopus"
mkdir -p "$DIR" && cd "$DIR"
git init
git config user.email "test@test.com" && git config user.name "Test"
git commit --allow-empty -m "base"
git checkout -b branch-a && git commit --allow-empty -m "a"
git checkout main 2>/dev/null || git checkout master
git checkout -b branch-b && git commit --allow-empty -m "b"
git checkout main 2>/dev/null || git checkout master
git merge branch-a branch-b -m "octopus merge"
cd -

# 4. Empty repo (no commits)
DIR="$FIXTURES_DIR/empty"
mkdir -p "$DIR" && cd "$DIR"
git init
git config user.email "test@test.com" && git config user.name "Test"
cd -

# 5. Tags (lightweight + annotated)
DIR="$FIXTURES_DIR/tags"
mkdir -p "$DIR" && cd "$DIR"
git init
git config user.email "test@test.com" && git config user.name "Test"
git commit --allow-empty -m "v1"
git tag v1.0
git commit --allow-empty -m "v2"
git tag -a v2.0 -m "release 2.0"
cd -

echo "Created fixtures in $FIXTURES_DIR:"
ls -la "$FIXTURES_DIR"
