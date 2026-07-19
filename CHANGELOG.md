# Changelog

## v1.0.0 - 2026-07-19

- Initial public release, ported to OpenClaw `2026.7.1-2`.
- Standalone apply script with signature-guarded, idempotent transformations,
  a `--dry-run` mode with cumulative in-memory transformations, and per-file
  backups before every write.
- Standalone checker validating all five guest-mode patch signatures; exits
  with code 1 when any signature is missing.
- Extracted only the guest-mode transforms; unrelated rich-delivery gate
  changes from the origin patch layer are not included.
