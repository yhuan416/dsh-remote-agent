# dsh-remote-agent

<p align="center">
  <a href="https://github.com/yhuan416/dsh-remote-agent/releases"><img alt="release" src="https://img.shields.io/github/v/tag/yhuan416/dsh-remote-agent?label=release"></a>
  <a href="https://github.com/yhuan416/dsh-remote-agent/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/yhuan416/dsh-remote-agent"></a>
  <img alt="node >=22.19.0" src="https://img.shields.io/badge/node-%3E%3D22.19.0-339933?logo=nodedotjs&logoColor=white">
  <img alt="dsh >=0.2.1-rc.2" src="https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.2-4D6BFE">
  <a href="https://github.com/yhuan416/dsh-remote-agent/actions/workflows/check.yml"><img alt="CI" src="https://github.com/yhuan416/dsh-remote-agent/actions/workflows/check.yml/badge.svg"></a>
</p>

> English | [中文](README.zh.md)
>
> Architecture: [ARCHITECTURE.md](ARCHITECTURE.md) · Compatibility: [COMPATIBILITY.md](COMPATIBILITY.md)
> Changelog: [CHANGELOG.md](CHANGELOG.md) · Roadmap: [TODO.md](TODO.md)
> Chinese docs: [docs/ARCHITECTURE.zh.md](docs/ARCHITECTURE.zh.md) · [docs/DEPLOY.zh.md](docs/DEPLOY.zh.md)
> Siblings: [dsh-remote-hub](https://github.com/yhuan416/dsh-remote-hub) · [dsh-opencode-client](https://github.com/yhuan416/dsh-opencode-client)

Agent-side DSH host plugin, installed on every backend a hub should reach. **It publishes this
process's launch token and identity to one 0600 file — no proxy, no tunnel, no HTTP route, no
tools.**

It writes `$DSH_HOME/remote-agent.json` (0600, atomic write), refreshes it every 60 s, and removes
it on shutdown. The token is generated per process and never persisted by dsh itself, so this file
is the clean way for a hub to mint the browser cookie without scraping `journalctl` or pasting
tokens by hand.

## Quick start

```sh
# 1. clone
git clone https://github.com/yhuan416/dsh-remote-agent ~/.dsh/plugins/dsh-remote-agent

# 2. install into the web profile (symlink + dependency + bundle selection)
cd ~/.dsh/plugins/dsh-remote-agent && ./scripts/install.sh web

# 3. restart dsh web, then verify: token present, updatedAt fresh
cat ~/.dsh/remote-agent.json
```

> **Restart `dsh web` after installing.** The bundle selection is composed at startup, so a plugin
> installed into a running process does not publish anything until that process restarts.

## Table of contents

- [Quick start](#quick-start)
- [What it writes](#what-it-writes)
- [Install (bundle, recommended)](#install-bundle-recommended)
- [Install (manual)](#install-manual)
- [Pair with the hub](#pair-with-the-hub)
- [Ecosystem](#ecosystem)
- [How it works](#how-it-works)
- [Config](#config)
- [Lifecycle and security](#lifecycle-and-security)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Development](#development)

## What it writes

```json
{
  "version": 1,
  "hostname": "yhuan-n100",
  "pid": 2533885,
  "startedAt": 1792413884370,
  "updatedAt": 1794197394348,
  "token": "<43-char launch token>",
  "webPort": 3080,
  "dshHome": "/home/yhuan/.dsh"
}
```

The hub consumes `token` (to exchange for the remote browser cookie) and `webPort` (which remote
port to tunnel to); `hostname`/`pid`/`startedAt`/`updatedAt` are there for diagnostics and
liveness. `version: 1` is the file schema version — adding fields is backward compatible.

## Install (bundle, recommended)

```sh
git clone https://github.com/yhuan416/dsh-remote-agent ~/.dsh/plugins/dsh-remote-agent
cd ~/.dsh/plugins/dsh-remote-agent
./scripts/install.sh web
```

The script symlinks the package into the profile, records it as a profile **dependency**, selects
it as a **bundle** (so it shows up in Settings → Plugins), and drops the legacy manual patch row
when present. Back up files first; restart `dsh web` afterwards (bundle selection is composed at
startup).

Then verify:

```sh
cat ~/.dsh/remote-agent.json    # token + fresh updatedAt
stat -c '%a %n' ~/.dsh/remote-agent.json   # 600
```

## Install (manual)

```sh
mkdir -p ~/.dsh/plugins
tar xzf dsh-remote-agent.tgz -C ~/.dsh/plugins
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/node_modules/dsh-remote-agent
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/web/node_modules/dsh-remote-agent
```

Append to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
```

Restart `dsh web`. With a manual patch row the plugin runs, but it is not listed as an installed
bundle on the Plugins page — the bundle install above is the recommended form.

## Pair with the hub

```yaml
# on the hub: ~/.dsh/profiles/web/cordis.patch.yml → dsh-remote-hub config
remotes:
  - id: n100
    label: yhuan@192.168.4.50
    ssh: { host: 192.168.4.50, user: yhuan }
    remotePort: 3080
    tokenFile:
      kind: ssh
      host: 192.168.4.50
      user: yhuan
      path: ~/.dsh/remote-agent.json
```

The hub reads `token` and `webPort` over ssh. Without this plugin, use an inline `token` or a
locally readable `tokenFile` instead.

Verify from the hub — the probe should report `tokenResolved: true`:

```sh
curl -s -X POST http://127.0.0.1:3080/api/remote-hosts/probe \
  -H 'content-type: application/json' -d '{"id":"n100"}'
```

## Ecosystem

| Repository | Side | Responsibility |
|---|---|---|
| [dsh-remote-hub](https://github.com/yhuan416/dsh-remote-hub) | Hub | Reverse proxy + managed ssh tunnels + token→cookie exchange + top-bar switcher + remote subagents |
| **dsh-remote-agent** (this repo) | Remote | Publishes the per-process launch token + identity file the hub reads |
| [dsh-opencode-client](https://github.com/yhuan416/dsh-opencode-client) | Sidecar | Treats OpenCode servers as a dsh subagent backend + client (independent of dsh remotes) |

## How it works

```mermaid
sequenceDiagram
    autonumber
    participant W as dsh web
    participant A as dsh-remote-agent
    participant F as remote-agent.json
    participant H as dsh-remote-hub
    participant B as browser

    W->>A: process start, plugin loaded
    A->>W: ctx.webServer.getOrigin() + ctx.connection.authenticatedUrl(origin + '/')
    W-->>A: URL carrying the per-process launch token
    A->>F: write payload (version 1, mode 0600, temp file + rename)
    loop every 60 s
        A->>F: rewrite payload with a fresh updatedAt (same token)
    end
    H->>F: ssh host cat ~/.dsh/remote-agent.json (tokenFile.kind = ssh)
    F-->>H: token + webPort
    H->>W: GET /?token=... (server-side exchange)
    W-->>H: Set-Cookie (remote cookie, cached in the hub process)
    B->>H: HTTP / WS / SSE to the hub origin only
    H->>W: reverse proxy /remotes/{id}/* with the cached cookie
    Note over A,F: graceful shutdown removes the file; a crash leaves a stale one
```

The browser only ever talks to the hub origin (DSH's same-origin fences require it); the remote
token and the remote cookie stay server-side. This plugin's whole job is the first half: make the
token readable by the hub over ssh.

## Config

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
      config:
        file: /custom/path/remote-agent.json   # optional
```

A generated settings form appears when the profile can resolve `@deepseek-ai/schemastery`. Without
it the plugin still works with defaults.

## Lifecycle and security

- Startup publishes immediately; a missing token retries for up to ~10 s (50 × 200 ms), then the
  60 s heartbeat keeps retrying.
- The file is 0600; a missing parent directory is created 0700 (existing permissions untouched).
- Writes are atomic: a temp file (`remote-agent.json.tmp-<pid>`) plus rename, so a reader never
  sees a half-written payload.
- Graceful shutdown removes the file. A crash leaves a stale file; the hub probe fails and the
  next publish replaces it.
- The token is a credential: never commit it or bake it into an image.

## Troubleshooting

| Symptom | Check |
|---|---|
| File missing | Is the plugin loaded? `Settings → Plugins`; restart dsh web after installing |
| No `token` field | DSH token discovery failed; check `dsh --version` compatibility. The file on disk may be a stale one from an earlier process |
| Hub says `tokenResolved: false` | ssh path/user/host; `ssh <host> cat ~/.dsh/remote-agent.json` |
| Stale `updatedAt` | Remote dsh is not running or heartbeat stopped. The file is rewritten every 60 s, so a timestamp older than a few minutes means the process is gone or wedged |
| File permissions are not 0600 | The plugin rewrites atomically with mode 0600; verify `stat -c '%a %n' ~/.dsh/remote-agent.json`. A file copied/written by hand is outside this contract |
| Two profiles fight over one file | Set a distinct `config.file` per instance. Two processes sharing one `DSH_HOME` race on the same path: the last writer wins and the other token disappears, so the hub sees a flickering `tokenResolved` |
| Hub tunnels to the wrong port | `webPort` is the **listening** port (`ctx.webServer.getOrigin()`). If a reverse proxy/NAT publishes a different port, the hub's `remotePort` must be reachable as-is; there is no override yet (see `TODO.md`) |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — roles, runtime sequence, payload, config, deliberate non-goals.
- [docs/ARCHITECTURE.zh.md](docs/ARCHITECTURE.zh.md) — Chinese architecture overview (same content).
- [docs/DEPLOY.zh.md](docs/DEPLOY.zh.md) — Chinese deployment and verification guide.
- [COMPATIBILITY.md](COMPATIBILITY.md) — supported dsh/Node versions and DSH API assumptions.
- [CHANGELOG.md](CHANGELOG.md) — release history.
- [TODO.md](TODO.md) — roadmap and known gaps.

## Development

```sh
npm run check   # offline: exports, manifest, bundle patch
```

CI runs the same command on every push to `main` and on pull requests
(`.github/workflows/check.yml`, Node 22). No `npm install` is needed.
