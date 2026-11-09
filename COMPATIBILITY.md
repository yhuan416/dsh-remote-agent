# Compatibility

## Supported versions

| Component | Version |
|---|---|
| dsh | `>=0.2.1-rc.2` (declared in `engines.dsh`; tested against `0.2.1-rc.2`) |
| Node.js | `>=22.19.0` |
| Hub | `dsh-remote-hub` with `tokenFile.kind: ssh` (or a manual token) |

## DSH API assumptions

- `ctx.webServer.getOrigin()` returns the listening origin (string).
- `ctx.connection.authenticatedUrl(url)` returns a URL whose `token` query parameter is the
  process launch token.
- Cleanup runs through `ctx.effect(fn, label)`; `ctx.logger.warn/info` are optional.
- Config schemastery is resolved from the profile when available; absent schema is non-fatal.
- Profile startup enforces `engines.dsh`.

If a DSH release changes token exposure or the authenticated-URL contract, the file may be empty
or missing `token`. Symptom: `cat ~/.dsh/remote-agent.json` shows no token, and the hub reports
`tokenResolved: false`. Fix `lib/index.js` (token discovery) and restart the remote.

## File schema

`version: 1`, fields `hostname`, `pid`, `startedAt`, `updatedAt`, `token`, `webPort`,
`dshHome`. The hub consumes `token` and `webPort`; adding fields is backward compatible, changing
their meaning requires a version bump and a hub update.

## Checking a build

```sh
npm run check   # offline: exports, manifest, bundle patch
```

End-to-end: install on a backend, restart `dsh web`, then
`cat ~/.dsh/remote-agent.json` and probe from the hub
(`POST /api/remote-hosts/probe {"id":"<remote>"}` → `tokenResolved: true`).
