# Changelog

All notable changes to xtage are documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.6.1

- **Security:** upgraded `adm-zip` from 0.5.16 to 0.6.0 to fix CVE-2024-27086 (crafted ZIP files trigger 4GB memory allocation). This affects GitHub repository downloads in `fetchRepoData()`.

## 0.6.0

- **Moved to the `@ruco-dev` scope.** Published as `@ruco-dev/xtage`; install with `npx -y @ruco-dev/xtage` or `claude mcp add xtage npx -- -y @ruco-dev/xtage`. The scope now matches the project's own domain rather than one it doesn't control.
- **`@ruco-ai/xtage` deprecated** — not unpublished. Existing installs keep working; the deprecation notice points to the new name.
- **Canonical home** is now [xtage.ruco.dev](https://xtage.ruco.dev), linked from the package `homepage` field.
- **Fixed:** the runtime `VERSION` constant (used by `xtage --version` and the MCP server handshake) had drifted at `0.4.0` and now tracks the package version.
- Packaging: `.flowdeck/` is excluded from the published tarball.

> A move to the *unscoped* name `xtage` was attempted for this release and abandoned — npm's registry rejects that name as too similar to existing packages (`etag`, `xstate`, `tape`, `taze`). Scoped names are exempt from that check, so `@ruco-dev/xtage` publishes normally. Don't retry the unscoped name; the rejection is permanent.
