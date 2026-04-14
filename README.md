# `semantic-release` monorepo filter

> Monorepo-aware `semantic-release` — one file, zero extra packages.

[![ci](https://github.com/ddforge/semantic-release-monorepo-filter/actions/workflows/ci.yml/badge.svg)](https://github.com/ddforge/semantic-release-monorepo-filter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`semantic-release` was designed for single-package repos. In a monorepo — where many packages share one Git history — every commit is visible to every package, so `semantic-release` releases all packages on every push, regardless of what actually changed.

This script fixes that. 🎯 Drop [`semantic-release-monorepo-filter.cjs`](./semantic-release-monorepo-filter.cjs) into your monorepo and run it from each package directory. It filters the commit history down to only commits that touched that package's directory, then hands them to `semantic-release` — so each package releases independently based on its own changes.

**Zero extra npm packages required** 📦 — it resolves `semantic-release` and its plugins from the package directory's own `node_modules`.

---

## ⚡ Setup

### 1. Copy the script

```bash
curl -o scripts/semantic-release-monorepo-filter.cjs \
  https://raw.githubusercontent.com/ddforge/semantic-release-monorepo-filter/main/semantic-release-monorepo-filter.cjs
```

Or just copy the file manually. Put it anywhere in your repo — `scripts/` is a common choice.

### 2. Add `.releaserc.json` to each package 📝

```json
{
  "branches": ["main"],
  "tagFormat": "packages/my-package/v${version}",
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/github"
  ]
}
```

> **`tagFormat`** must be unique per package to prevent tag collisions across packages in the same repository.

### 3. Replace `npx semantic-release` 🔄

```bash
# Before (abandoned, vulnerable) 💀
npx semantic-release -e semantic-release-monorepo

# After ✅
node /path/to/scripts/semantic-release-monorepo-filter.cjs
```

Run the script from within the package directory, after `npm install` has been run there so `semantic-release` and its plugins are available.

---

## 🛠️ Usage

### Shell script

```bash
#!/usr/bin/env bash
npm install --save-dev \
    semantic-release \
    @semantic-release/commit-analyzer \
    @semantic-release/release-notes-generator \
    @semantic-release/github

SCRIPT="$(git rev-parse --show-toplevel)/scripts/semantic-release-monorepo-filter.cjs"

release_package() {
  local pkg_dir="$1"
  (
    cd "$pkg_dir"

    # Dry run — inspect the next version without publishing 🔍
    node "$SCRIPT" --dry-run

    # Full release 🎉
    node "$SCRIPT"
  )
}

release_package packages/my-package
release_package packages/other-package
```

### GitHub Actions 🤖

```yaml
- name: Release my-package
  working-directory: packages/my-package
  run: |
    npm install --save-dev \
      semantic-release \
      @semantic-release/commit-analyzer \
      @semantic-release/release-notes-generator \
      @semantic-release/github
    node ../../scripts/semantic-release-monorepo-filter.cjs
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Options

| Flag | Description |
| ---- | ----------- |
| `--dry-run` | 🔍 Determine next version and generate release notes; skip publish and tag |
| `--dryRun`  | Alias for `--dry-run` |

---

## 🔍 How commit matching works

For each commit, the script runs:

```
git diff-tree --no-commit-id -r --name-only <hash>
```

A commit is included for a package at `packages/my-package` if at least one changed file:

- ✅ **equals** `packages/my-package` (the directory itself), or
- ✅ **starts with** `packages/my-package/`

The trailing `/` prevents false positives from sibling directories like `packages/my-package-extra/`. 🛡️

Commits where `git diff-tree` fails (e.g. initial commit, certain merge commits) are treated as having no changed files and are excluded.

If **no** commits match, `analyzeCommits` returns `null` and `semantic-release` exits cleanly without creating a release. 😴

---

## 📚 Examples

See [`examples/`](./examples) for ready-to-use `.releaserc.json` configurations:

| Directory | Description |
| --------- | ----------- |
| [`examples/basic/`](./examples/basic/) | GitHub release with exec hooks |
| [`examples/conventional-commits/`](./examples/conventional-commits/) | Custom release rules and changelog sections |

---

## 🧪 Development

```bash
git clone https://github.com/ddforge/semantic-release-monorepo-filter.git
cd semantic-release-monorepo-filter
npm install
npm test
```

Tests use Node.js's built-in test runner (`node:test`) — no test framework to install. Git calls are replaced with injectable stubs so tests run without a real repository. 🙌

---

## 📄 License

[MIT](LICENSE)
