/**
 * dsh-remote-agent — agent-side host plugin, installed on every backend that a
 * hub should be able to reach.
 *
 * It publishes this process's launch token plus basic identity to
 * $DSH_HOME/remote-agent.json (0600, atomic write). The token is per-process
 * and never persisted by dsh itself, so this file is the only clean way for a
 * hub to mint the browser cookie without scraping logs.
 *
 * The file is removed on shutdown, so a missing file means "that dsh is not
 * running".
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const name = 'remote-agent'
export const inject = ['connection', 'webServer']

const MAX_ATTEMPTS = 50
const RETRY_MS = 200
const HEARTBEAT_MS = 60 * 1000
const FILE_VERSION = 1

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv
  return path.join(os.homedir(), '.dsh')
}

function writeAtomic(file, text) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = file + '.tmp-' + String(process.pid)
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function apply(ctx, config) {
  const cfg = config === undefined || config === null ? {} : config
  const target = typeof cfg.file === 'string' && cfg.file !== ''
    ? cfg.file
    : path.join(dshHome(), 'remote-agent.json')

  let timer
  let heartbeat
  let attempts = 0
  let stopped = false

  function stop() {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    if (heartbeat !== undefined) clearInterval(heartbeat)
    try { fs.unlinkSync(target) } catch {}
  }

  function publish(startedAt) {
    let origin
    let token
    try {
      origin = new URL(ctx.webServer.getOrigin())
      const authed = new URL(ctx.connection.authenticatedUrl(origin.origin + '/'))
      const value = authed.searchParams.get('token')
      token = value === null ? undefined : value
    } catch {
      token = undefined
    }
    if (token === undefined || token === '') {
      attempts += 1
      if (!stopped && attempts < MAX_ATTEMPTS) timer = setTimeout(function () { publish(startedAt) }, RETRY_MS)
      return
    }
    const payload = {
      version: FILE_VERSION,
      hostname: os.hostname(),
      pid: process.pid,
      startedAt: startedAt,
      updatedAt: Date.now(),
      token: token,
      webPort: Number(origin.port === '' ? 80 : origin.port),
      dshHome: dshHome(),
    }
    try {
      writeAtomic(target, JSON.stringify(payload, null, 2) + '\n')
    } catch (error) {
      if (ctx.logger !== undefined && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('remote-agent: cannot write ' + target + ': ' + error.message)
      }
    }
  }

  const startedAt = Date.now()
  timer = setTimeout(function () { publish(startedAt) }, 0)
  heartbeat = setInterval(function () { publish(startedAt) }, HEARTBEAT_MS)

  ctx.effect(function () {
    return stop
  }, 'remote-agent: identity file')

  if (ctx.logger !== undefined && typeof ctx.logger.info === 'function') {
    ctx.logger.info('remote-agent: publishing identity to ' + target)
  }
}
