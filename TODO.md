# TODO

## Next

- Offline unit tests for the token-discovery/retry path and the atomic writer (inject a fake
  `ctx`; no dsh runtime).
- Multi-instance safety: detect two processes targeting the same identity file and warn, or
  derive a per-port suffix.
- Expose `webPort` override in config for reverse-proxied backends whose public port differs
  from the listening port.
- Surface write failures in the file (e.g. `lastError`) or via a health probe the hub can read.

## Later

- Short-lived / rotating token support once dsh exposes a rotation hook.
- Optional systemd unit example in `docs/`.
- Locale dictionaries for the config form (currently English descriptions).
