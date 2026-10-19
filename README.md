# dsh-remote-agent

Agent-side DSH host plugin, installed on every backend a hub should reach.

It publishes this process's launch token + identity to `$DSH_HOME/remote-agent.json`
(0600, atomic write) and removes the file on shutdown. The token is generated per
process and never persisted by dsh itself, so this file is the clean way for a hub to
mint the browser cookie without scraping `journalctl`.

```json
{
  "version": 1,
  "hostname": "yhuan-n100",
  "pid": 1234,
  "startedAt": 1792400000000,
  "updatedAt": 1792400000000,
  "token": "<43-char launch token>",
  "webPort": 3080,
  "dshHome": "/home/yhuan/.dsh"
}
```

## Install

```sh
# 1) place the package where the profile can resolve it
mkdir -p ~/.dsh/plugins
tar xzf dsh-remote-agent.tgz -C ~/.dsh/plugins
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/node_modules/dsh-remote-agent
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/web/node_modules/dsh-remote-agent

# 2) append to ~/.dsh/profiles/web/cordis.patch.yml
# - insert:
#     - id: remote-agent
#       name: dsh-remote-agent

# 3) restart dsh web; then check
cat ~/.dsh/remote-agent.json
```

Optional config: `{ file: "/custom/path/remote-agent.json" }`.

Hub side pairs with `tokenFile: { kind: ssh, host, user, path: ~/.dsh/remote-agent.json }`.
