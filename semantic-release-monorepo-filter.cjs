#!/usr/bin/env node
/**
 * semantic-release-monorepo-filter.cjs
 *
 * Drop this single file anywhere in your monorepo. Call it from each package
 * directory that has a .releaserc.json. No extra npm packages required.
 *
 * USAGE
 * -----
 *   node scripts/semantic-release-monorepo-filter.cjs [--dry-run]
 *
 * Run from within the package directory that contains .releaserc.json.
 * semantic-release (and its plugins) must be installed in that directory.
 *
 * WHY THIS EXISTS
 * ---------------
 * The popular `semantic-release-monorepo` package is abandoned (~2022) and
 * carries transitive vulnerability GHSA-f886-m6hf-6m8v (brace-expansion@1.x).
 *
 * HOW IT WORKS
 * ------------
 * semantic-release deep-clones context before every plugin call (normalize.js),
 * so a plugin that mutates context.commits will always receive a fresh,
 * unfiltered copy on the next call — mutation-based approaches cannot work.
 *
 * The only reliable approach is the programmatic API:
 *   1. Read .releaserc.json and extract the commit-analyzer and
 *      release-notes-generator entries (preserving their per-plugin config).
 *   2. Replace them with thin wrappers that call `git diff-tree` per commit
 *      hash to identify which commits touched the current directory, then
 *      delegate to the real plugins with the filtered commit list.
 *   3. Run all other configured plugins (exec, github, npm, …) unchanged.
 *
 * If no commits touch the current directory, analyzeCommits returns null
 * and semantic-release skips the release entirely — no tag, no publish.
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

// ─── helpers (exported so tests can verify them without exec'ing git) ────────

/**
 * Returns the absolute path of the git repository root.
 * @param {string} cwd
 * @param {Function} [exec] - injectable for testing
 * @returns {string}
 */
function repoRoot(cwd, exec = execSync) {
  return exec('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim()
}

/**
 * Lists files changed in one commit. Returns [] on any git error (e.g. merge commits).
 * @param {string} hash
 * @param {string} cwd
 * @param {Function} [exec] - injectable for testing
 * @returns {string[]}
 */
function changedFilesInCommit(hash, cwd, exec = execSync) {
  try {
    return exec(`git diff-tree --no-commit-id -r --name-only ${hash}`, { cwd, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Returns a filter function that keeps only commits touching the given directory.
 * When cwd equals the repo root the filter is a no-op (returns all commits).
 * Sibling directories sharing a common prefix are excluded correctly via the
 * trailing-slash guard: "pkg/" does not match "pkg-extra/file.js".
 * @param {string} cwd
 * @param {{ exec?: Function }} [options]
 * @returns {(commits: object[]) => object[]}
 */
function createCommitFilter(cwd, { exec = execSync } = {}) {
  const rel = path.relative(repoRoot(cwd, exec), cwd)
  return function filterCommits(commits) {
    if (!rel) return commits
    return commits.filter(commit =>
      changedFilesInCommit(commit.hash, cwd, exec).some(f =>
        f === rel || f.startsWith(rel + '/')
      )
    )
  }
}

/**
 * Removes all occurrences of a named plugin from a plugins array and returns
 * its last-seen config alongside the remaining plugin list.
 * @param {Array} plugins
 * @param {string} pluginName
 * @returns {{ config: object, remaining: Array }}
 */
function extractPluginConfig(plugins, pluginName) {
  let config = {}
  const remaining = plugins.filter(entry => {
    const name = Array.isArray(entry) ? entry[0] : entry
    if (name === pluginName) {
      config = (Array.isArray(entry) && entry[1]) ? entry[1] : {}
      return false
    }
    return true
  })
  return { config, remaining }
}

// ─── main entry point ────────────────────────────────────────────────────────

/**
 * Core runner. Reads .releaserc.json from `cwd`, wraps the commit-analyzer
 * and release-notes-generator with path-scoped filters, and invokes
 * semantic-release's programmatic API.
 *
 * All modules are resolved from `cwd` so they come from the package's own
 * node_modules — this file carries zero runtime dependencies.
 *
 * @param {string} cwd - directory containing .releaserc.json and node_modules
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<object|false>}
 */
async function run(cwd, { dryRun = false } = {}) {
  const releasercPath = path.join(cwd, '.releaserc.json')
  if (!fs.existsSync(releasercPath)) {
    throw new Error(`No .releaserc.json found in ${cwd}`)
  }

  const releaserc = JSON.parse(fs.readFileSync(releasercPath, 'utf8'))
  if (!Array.isArray(releaserc.plugins)) {
    throw new Error('.releaserc.json must contain a "plugins" array')
  }
  if (dryRun) releaserc.dryRun = true

  const filterCommits = createCommitFilter(cwd)

  let { config: analyzerConfig, remaining } = extractPluginConfig(
    releaserc.plugins, '@semantic-release/commit-analyzer'
  )
  let { config: generatorConfig, remaining: remainingPlugins } = extractPluginConfig(
    remaining, '@semantic-release/release-notes-generator'
  )

  // Resolve from cwd — semantic-release v20+ is ESM, so dynamic import is required.
  const resolve = (pkg) => require.resolve(pkg, { paths: [cwd] })
  const { analyzeCommits } = await import(resolve('@semantic-release/commit-analyzer'))
  const { generateNotes } = await import(resolve('@semantic-release/release-notes-generator'))
  const { default: semanticRelease } = await import(resolve('semantic-release'))

  releaserc.plugins = [
    {
      async analyzeCommits(_config, context) {
        const commits = filterCommits(context.commits)
        return commits.length ? analyzeCommits(analyzerConfig, { ...context, commits }) : null
      },
      async generateNotes(_config, context) {
        return generateNotes(generatorConfig, { ...context, commits: filterCommits(context.commits) })
      }
    },
    ...remainingPlugins
  ]

  return semanticRelease(releaserc)
}

// Export helpers for testing. When require()'d, this file is a module;
// when executed directly it is a CLI runner.
module.exports = { repoRoot, changedFilesInCommit, createCommitFilter, extractPluginConfig, run }

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  run(process.cwd(), { dryRun })
    .then(result => { if (!result) process.exit(0) })
    .catch(err => { console.error(err.message || err); process.exit(1) })
}
