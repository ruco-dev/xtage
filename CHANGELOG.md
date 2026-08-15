# Changelog

All notable changes to xtage are documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.6.1

- **Security:** upgraded `adm-zip` from 0.5.16 to 0.6.0 to fix GHSA-xcpc-8h2w-3j85 (crafted ZIP files trigger 4GB memory allocation, CWE-400/789). This affects GitHub repository downloads in `fetchRepoData()`.
- **Migrated** runtime dependency from deprecated `@ruco-ai/mcpster` to unscoped `mcpster` (same API; upstream renamed the package).
- **Removed** unused `minimatch` dependency.
- **Fixed:** `src/version.ts` now generated from `package.json` via `prebuild` script — VERSION constant can no longer drift.
- **Packaging:** `prepack` runs a full build so `npm pack` always ships a complete `dist/`.
- **CI:** added `.github/workflows/ci.yml` (install → build → test → pack check on every push).

## 0.6.0

- **Moved to the `@ruco-dev` scope.** Published as `@ruco-dev/xtage`; install with `npx -y @ruco-dev/xtage` or `claude mcp add xtage npx -- -y @ruco-dev/xtage`. The scope now matches the project's own domain rather than one it doesn't control.
- **`@ruco-ai/xtage` deprecated** — not unpublished. Existing installs keep working; the deprecation notice reads: "Renamed to @ruco-dev/xtage — install with: npx -y @ruco-dev/xtage".
- **Canonical home** is now [xtage.ruco.dev](https://xtage.ruco.dev), linked from the package `homepage` field.
- **Fixed:** the runtime `VERSION` constant (used by `xtage --version` and the MCP server handshake) had drifted at `0.4.0` and now tracks the package version.
- Packaging: `.flowdeck/` is excluded from the published tarball.

> A move to the *unscoped* name `xtage` was attempted for this release and abandoned — npm's registry rejects that name as too similar to existing packages (`etag`, `xstate`, `tape`, `taze`). Scoped names are exempt from that check, so `@ruco-dev/xtage` publishes normally. Don't retry the unscoped name; the rejection is permanent.

## 0.5.0

- **New:** `xtage install` / `xtage uninstall` — wire four Claude Code hooks into `.claude/settings.local.json` in one command. Gate denies `Read|Grep|Glob` on files with fresh chunk summaries; flag/clear manage per-session consulted state; dirty tracks edits; SessionStart injects a compact REPO.md + CODEINDEX digest as `additionalContext`.
- **New:** `xtage context` — prints the SessionStart digest (≤2k tokens) as `additionalContext` JSON; used by the SessionStart hook.
- **New:** `dirty.mjs` hook auto-wires `sync_from_claude_memory` — no manual hook setup needed.
- **New:** git `post-commit` hook installed automatically by `xtage install`.
- **Deprecated:** `xtage start` (now an alias for `xtage install`); `xtage end` (no-op).

## 0.4.0

- **New:** `sync_from_claude_memory` MCP tool — reads Claude auto-memory files and merges them into `PROJECTINSIGHTS.md`. Wire it with a Claude Code `PostToolUse` hook so every memory write propagates to xtage automatically.
- **Removed:** dead `init.ts` and `update.ts` modules (logic had already moved to `cli.ts` via `runClaude`); removed `installGitHook` from `hook.ts`.
- **Fixed:** `sync_from_claude_memory` added to `XTAGE_TOOLS` so `ensureXtagePermissions()` grants it on `xtage init`.

## 0.3.x

- Session token tracking and `get_session_stats` tool
- Per-file chunk summaries (`write_file_chunk`, `read_file_chunk`, `list_file_chunks`)
- Open-source release: LICENSE, telemetry disclosure, `.npmignore`
