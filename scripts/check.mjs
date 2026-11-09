#!/usr/bin/env node
/** Offline package checks: exports, manifest, bundle patch. No network, no dsh runtime. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as entry from '../lib/index.js'

assert.equal(entry.name, 'remote-agent')
assert.deepEqual(entry.inject, ['connection', 'webServer'])
assert.equal(typeof entry.apply, 'function')

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(pkg.type, 'module')
assert.equal(pkg.exports['.'], './lib/index.js')
assert.equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.ok(typeof pkg.engines.dsh === 'string' && pkg.engines.dsh.length > 0, 'engines.dsh declared')
assert.ok(pkg.files.includes('cordis.patch.yml'))
assert.ok(pkg.files.includes('ARCHITECTURE.md'))

const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
assert.ok(patch.includes('id: remote-agent'))
assert.ok(patch.includes('name: dsh-remote-agent'))

console.log('check ok')
