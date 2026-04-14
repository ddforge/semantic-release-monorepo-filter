'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { extractPluginConfig, createCommitFilter } = require('../semantic-release-monorepo-filter.cjs')

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Returns a fake exec that matches commands by substring.
 * Pass an Error instance to simulate command failure.
 */
function mockExec(responses) {
  return function exec(cmd) {
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        if (response instanceof Error) throw response
        return response
      }
    }
    throw new Error(`Unexpected command: ${cmd}`)
  }
}

// ─── extractPluginConfig ────────────────────────────────────────────────────

test('string entry is removed, returns empty config', () => {
  const plugins = ['@semantic-release/commit-analyzer', '@semantic-release/exec']
  const { config, remaining } = extractPluginConfig(plugins, '@semantic-release/commit-analyzer')
  assert.deepEqual(config, {})
  assert.deepEqual(remaining, ['@semantic-release/exec'])
})

test('array entry preserves plugin config', () => {
  const plugins = [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    '@semantic-release/exec'
  ]
  const { config, remaining } = extractPluginConfig(plugins, '@semantic-release/commit-analyzer')
  assert.deepEqual(config, { preset: 'conventionalcommits' })
  assert.deepEqual(remaining, ['@semantic-release/exec'])
})

test('array entry with null config returns empty config', () => {
  const plugins = [['@semantic-release/commit-analyzer', null], '@semantic-release/exec']
  const { config } = extractPluginConfig(plugins, '@semantic-release/commit-analyzer')
  assert.deepEqual(config, {})
})

test('plugin not found leaves list unchanged', () => {
  const plugins = ['@semantic-release/exec', '@semantic-release/github']
  const { config, remaining } = extractPluginConfig(plugins, '@semantic-release/commit-analyzer')
  assert.deepEqual(config, {})
  assert.deepEqual(remaining, plugins)
})

test('all occurrences are removed when plugin appears more than once', () => {
  const plugins = [
    '@semantic-release/commit-analyzer',
    '@semantic-release/exec',
    '@semantic-release/commit-analyzer'
  ]
  const { remaining } = extractPluginConfig(plugins, '@semantic-release/commit-analyzer')
  assert.deepEqual(remaining, ['@semantic-release/exec'])
})

// ─── createCommitFilter ─────────────────────────────────────────────────────

test('includes commits that touched the package directory', () => {
  const exec = mockExec({
    'rev-parse --show-toplevel': '/repo\n',
    'abc1234': 'packages/my-pkg/src/index.js\npackages/other/README.md\n',
    'def5678': 'packages/other/src/lib.js\n'
  })
  const filter = createCommitFilter('/repo/packages/my-pkg', { exec })
  const result = filter([
    { hash: 'abc1234', message: 'fix: something' },
    { hash: 'def5678', message: 'chore: unrelated' }
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].hash, 'abc1234')
})

test('returns all commits when cwd equals repo root (no-op)', () => {
  const exec = mockExec({
    'rev-parse --show-toplevel': '/repo\n',
    'abc1234': 'src/index.js\n'
  })
  const filter = createCommitFilter('/repo', { exec })
  const commits = [{ hash: 'abc1234' }, { hash: 'abc1234' }]
  assert.equal(filter(commits).length, 2)
})

test('excludes all commits when none touch the package directory', () => {
  const exec = mockExec({
    'rev-parse --show-toplevel': '/repo\n',
    'abc1234': 'packages/other/src/index.js\n'
  })
  const filter = createCommitFilter('/repo/packages/my-pkg', { exec })
  assert.equal(filter([{ hash: 'abc1234' }]).length, 0)
})

test('handles git diff-tree failure gracefully (merge commits, etc.)', () => {
  const exec = mockExec({
    'rev-parse --show-toplevel': '/repo\n',
    'badhash': new Error('fatal: bad object'),
    'goodhash': 'packages/my-pkg/index.js\n'
  })
  const filter = createCommitFilter('/repo/packages/my-pkg', { exec })
  const result = filter([
    { hash: 'badhash', message: 'Merge branch ...' },
    { hash: 'goodhash', message: 'fix: real fix' }
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].hash, 'goodhash')
})

test('does not match sibling directories sharing a path prefix', () => {
  // "packages/my-pkgextra/file.js" must NOT match the filter for "packages/my-pkg"
  const exec = mockExec({
    'rev-parse --show-toplevel': '/repo\n',
    'sibling': 'packages/my-pkgextra/file.js\n',
    'nested':  'packages/my-pkg/deep/file.js\n',
    'exact':   'packages/my-pkg\n'
  })
  const filter = createCommitFilter('/repo/packages/my-pkg', { exec })
  const result = filter([
    { hash: 'sibling', message: 'fix: sibling' },
    { hash: 'nested',  message: 'fix: nested file' },
    { hash: 'exact',   message: 'chore: dir itself' }
  ])
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(c => c.hash), ['nested', 'exact'])
})
