# Project

## Vision

xtage gives Claude persistent, semantic knowledge of a codebase — across every session, without manual context-setting. It maintains a knowledge base in `~/xtage/` (REPO.md, CODEINDEX.md, per-file chunk summaries) and enforces consultation via deterministic Claude Code hooks before agents touch source files.

## Current state

- MCP server with full read/write/fetch/registry tool suite
- Per-file chunk summaries (`write_file_chunk`, `read_file_chunk`, `list_file_chunks`)
- Session token tracking (`get_session_stats`)
- Claude memory sync (`sync_from_claude_memory`)
- **stagehand hook layer** (`xtage install`): gate/flag/clear/dirty hooks wired into `.claude/settings.local.json`; SessionStart digest injection; git post-commit auto-update
- Published as `@ruco-dev/xtage@0.6.1` (latest on npm); `@ruco-ai/xtage` is deprecated — deprecation message partially updated (0.1.0–0.4.0 done; requires OTP to complete, see Known gaps)
- `package-lock.json` is tracked — installs are reproducible; `npm audit --omit=dev` → 0 vulnerabilities
- `ruco-dev/xtage` is public on GitHub; all commits and tags (`v0.6.0`, `v0.6.1`) pushed
- `scripts/gen-version.mjs` + `prebuild` hook — `src/version.ts` is now generated from `package.json` on every build; VERSION drift cannot recur
- `prepack: "npm run build"` — `npm pack` always produces a complete `dist/`; pack includes dist/cli.js (15.2kB)
- `.github/workflows/ci.yml` — CI runs install → build → binary-check → test → pack-check on every push
- Migrated from deprecated `@ruco-ai/mcpster` to unscoped `mcpster`; removed unused `minimatch`
- `repository` and `bugs` fields added to `package.json`; CHANGELOG covers full history (0.3.x → 0.6.1)
- README install line, sync-memory, serve documented; `.gitignore` self-contradiction resolved
- README "Upgrading from `@ruco-ai/xtage`" migration section added — documents `npm uninstall -g @ruco-ai/xtage && npm install -g @ruco-dev/xtage` to avoid EEXIST on global upgrade

## Known gaps

- No xtage index exists for the xtage repo itself yet — run `xtage init` to bootstrap; gate currently fails-open everywhere
- git post-commit hook spawns a Claude session on every commit (including in this repo) — needs a guard when no index exists
- Before/after token stat comparison not yet captured (requires interactive sessions)
- **`@ruco-ai/xtage` deprecation message is still `*` for versions 0.5.0+** — `npm deprecate` ran but hit OTP (2FA) after updating 0.1.0–0.4.0. Re-run with OTP: `npm deprecate @ruco-ai/xtage@"*" "Renamed to @ruco-dev/xtage — install with: npx -y @ruco-dev/xtage"`

> Full evidence: `.flowdeck/_meld/2026-08-15-prepare-to-publish/AUDIT.md` (2026-08-15 play — all 5 blockers and 9 warnings resolved; H7 OTP deprecation pending human action).
