# Changelog

## Unreleased

### Added

- CI workflow (`.github/workflows/check.yml`): `npm run check` on push to `main` and on pull
  requests, Node 22, no `npm install` needed.
- `.gitattributes` (LF normalization, binary image markers, SVG as text) and `.editorconfig`
  (UTF-8, LF, final newline, 2-space indent, Markdown keeps trailing whitespace).
- README restructure with badge row, TOC, mermaid sequence diagram, ecosystem table and expanded
  troubleshooting; bilingual structure kept in sync.
- `docs/ARCHITECTURE.zh.md` (Chinese architecture overview) and `docs/DEPLOY.zh.md` (Chinese
  deployment and verification guide).

### Changed

- README structure: quick start first, install/pair sections kept and strengthened, new
  Documentation section pointing at the Chinese docs.

## 0.2.0 — 2026-11-09

### Added

- Generated config form for the optional `file` path (schemastery resolved from the profile).
- `engines.dsh`, `manifestVersion`, `icon.svg`, `exports` for `cordis.patch.yml` and
  `package.json`, offline `scripts/check.mjs`, and the `npm run check` script.
- `ARCHITECTURE.md`, `COMPATIBILITY.md`, `TODO.md`, and expanded install/verify docs.

### Changed

- `scripts/install.sh` now registers the package as a profile **dependency** and selected
  **bundle** (visible in the Plugins page), and removes the legacy manual patch row.
- README restructured: bundle install first, manual install second, payload/lifecycle/security
  documented.

## 0.1.0 — 2026-10-19

### Added

- Agent-side host plugin publishing launch token + identity to `$DSH_HOME/remote-agent.json`
  (0600, atomic write, 60 s heartbeat, removed on shutdown).
- Optional `file` config; install script and bilingual README.
