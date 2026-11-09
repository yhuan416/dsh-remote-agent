# dsh-remote-agent

> English | [中文](README.zh.md)
>
> Architecture: [ARCHITECTURE.md](ARCHITECTURE.md) · Compatibility: [COMPATIBILITY.md](COMPATIBILITY.md)
> Changelog: [CHANGELOG.md](CHANGELOG.md) · Roadmap: [TODO.md](TODO.md)
> Deployment guide (Chinese): [dsh-remote-hub/docs/DEPLOY.zh.md](https://github.com/yhuan416/dsh-remote-hub/blob/main/docs/DEPLOY.zh.md)

Agent-side DSH host plugin, installed on every backend a hub should reach.

It publishes this process's launch token + identity to `$DSH_HOME/remote-agent.json`
(0600, atomic write), refreshes it every 60 s, and removes it on shutdown. The token is generated
per process and never persisted by dsh itself, so this file is the clean way for a hub to mint the
browser cookie without scraping `journalctl` or pasting tokens by hand.

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

Restart `dsh web`.

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

## Config

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
      config:
        file: /custom/path/remote-agent.json   # optional
```

A generated settings form appears when the profile can resolve `@deepseek-ai/schemastery`.

## Lifecycle and security

- Startup publishes immediately; a missing token retries for up to ~10 s, then the 60 s heartbeat
  keeps retrying.
- The file is 0600; a missing parent directory is created 0700 (existing permissions untouched).
- Graceful shutdown removes the file. A crash leaves a stale file; the hub probe fails and the
  next publish replaces it.
- The token is a credential: never commit it or bake it into an image.

## Troubleshooting

| Symptom | Check |
|---|---|
| File missing | Is the plugin loaded? `Settings → Plugins`; restart dsh web |
| No `token` field | DSH token discovery failed; check `dsh --version` compatibility |
| Hub says `tokenResolved: false` | ssh path/user/host; `ssh <host> cat ~/.dsh/remote-agent.json` |
| Stale `updatedAt` | Remote dsh is not running or heartbeat stopped |
| Two profiles fight over one file | Set a distinct `config.file` per instance |

## Development

```sh
npm run check   # offline: exports, manifest, bundle patch
```
