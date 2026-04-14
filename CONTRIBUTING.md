# Contributing 🤝

Thanks for taking the time to contribute! Here's everything you need to get started.

---

## 🛠️ Local setup

```bash
git clone https://github.com/ddforge/semantic-release-monorepo-filter.git
cd semantic-release-monorepo-filter
npm install
```

---

## 🧪 Running tests

```bash
npm test
```

Tests use Node.js's built-in test runner (`node:test`) — no extra framework needed. Git calls are replaced with injectable stubs so the suite runs without a real repository.

---

## 🔧 Project structure

```
semantic-release-monorepo-filter.cjs   # The main script — the only file users copy
test/
  index.test.js                        # All tests live here
examples/
  basic/                               # Example .releaserc.json — GitHub release with exec hooks
  conventional-commits/                # Example .releaserc.json — custom rules and changelog
```

The project is intentionally minimal. The entire implementation lives in a single `.cjs` file so users can drop it into any monorepo without adding an npm dependency.

---

## 📐 Guidelines

- **Keep it one file.** The whole point is `cp semantic-release-monorepo-filter.cjs my-monorepo/scripts/`. Avoid introducing a build step or splitting logic across modules.
- **No new runtime dependencies.** The script must work with only Node.js built-ins plus whatever `semantic-release` already provides.
- **Tests for every meaningful change.** If you add or change behaviour, add a corresponding test in `test/index.test.js`.
- **Conventional commits.** Use [Conventional Commits](https://www.conventionalcommits.org/) for your commit messages — the project uses `semantic-release` to release itself.

---

## 🐛 Reporting bugs

Open an issue and include:

1. Node.js version (`node --version`)
2. The command you ran and the directory you ran it from
3. The full error output or unexpected behaviour
4. A minimal reproduction if possible

---

## 💡 Suggesting features

Open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered

---

## 🔀 Submitting a pull request

1. Fork the repo and create a branch off `main`
2. Make your changes and add or update tests
3. Run `npm test` and make sure everything passes ✅
4. Open a PR with a clear description of what changed and why

---

## 📄 License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
