# Project

## Vision

xtage gives Claude persistent, semantic knowledge of a codebase — across every session, without manual context-setting. It maintains a knowledge base in `~/xtage/` (REPO.md, CODEINDEX.md, per-file chunk summaries) and enforces consultation via deterministic Claude Code hooks before agents touch source files.

## Current state

- MCP server with full read/write/fetch/registry tool suite
- Per-file chunk summaries (`write_file_chunk`, `read_file_chunk`, `list_file_chunks`)
- Session token tracking (`get_session_stats`)
- Claude memory sync (`sync_from_claude_memory`)
- **stagehand hook layer** (`xtage install`): gate/flag/clear/dirty hooks wired into `.claude/settings.local.json`; SessionStart digest injection; git post-commit auto-update
- Published as `@ruco-dev/xtage@0.6.1` (latest on npm); `@ruco-ai/xtage` is fully deprecated — all 7 versions it has (0.1.0–0.4.0) carry the message "Renamed to @ruco-dev/xtage — install with: npx -y @ruco-dev/xtage". **Caveat:** the published 0.6.1 was cut from `a611566`, before the mcpster migration, so it still declares `@ruco-ai/mcpster` + `minimatch` — see Known gaps
- `package-lock.json` is tracked — installs are reproducible; `npm audit --omit=dev` → 0 vulnerabilities
- `ruco-dev/xtage` is public on GitHub; tags `v0.6.0` and `v0.6.1` are pushed, but `origin/master` is at `6f70da8` — **11 commits behind local**, so the CI workflow below has never actually run
- `scripts/gen-version.mjs` + `prebuild` hook — `src/version.ts` is now generated from `package.json` on every build; VERSION drift cannot recur
- `prepack: "npm run build"` — `npm pack` always produces a complete `dist/`; pack includes dist/cli.js (15.2kB)
- `.github/workflows/ci.yml` — CI runs install → build → binary-check → test → pack-check on every push
- Migrated from deprecated `@ruco-ai/mcpster` to unscoped `mcpster`; removed unused `minimatch` — **in the working tree only**; this landed in `d7d771a`, one commit after the `v0.6.1` tag, so it is not in any published version
- `repository` and `bugs` fields added to `package.json`; CHANGELOG covers full history (0.3.x → 0.6.1)
- README install line, sync-memory, serve documented; `.gitignore` self-contradiction resolved
- README "Upgrading from `@ruco-ai/xtage`" migration section added — documents `npm uninstall -g @ruco-ai/xtage && npm install -g @ruco-dev/xtage` to avoid EEXIST on global upgrade
- `xtage init` (local-path branch) now calls `registerRepo` before the agent runs, and both init branches verify `CODEINDEX.md` exists after the agent exits — prints `✗ Index was not written` + exits 1 on failure instead of falsely reporting `✓ Indexed`
- Root cause of that missing-index failure found and fixed: the `claude -p` subprocess `init` spawns was allow-listed for `mcp__xtage__*` tools but never had the xtage MCP server registered with it (subprocesses don't inherit MCP registrations) — every `write_codeindex` call had nowhere to land. Fixed by passing `--mcp-config` pointing the subprocess at this binary's own `serve`; `exitUnlessIndexed()` now also distinguishes "no MCP tools reachable" (no files written) from "agent stopped partway" (REPO.md exists, CODEINDEX.md doesn't) so the error tells you which is true
- `last_indexed` frontmatter moved from prompt-build time (stale by the full run duration on long indexes) to a stamp applied inside `write_codeindex` itself, covering both `init` and `update`

## Known gaps

- No xtage index exists for the xtage repo itself yet — run `xtage init` to bootstrap; gate currently fails-open everywhere
- git post-commit hook spawns a Claude session on every commit (including in this repo) — needs a guard when no index exists
- Before/after token stat comparison not yet captured (requires interactive sessions)
- **Published `0.6.1` ≠ local `0.6.1`** — one version number, two artifacts. The registry's copy declares the upstream-deprecated `@ruco-ai/mcpster@^0.2.5` and dead `minimatch`, while `CHANGELOG.md` says 0.6.1 removed both. Only a `0.6.2` release resolves it
- **`package.json` declares the package as its own runtime dependency** (`"@ruco-dev/xtage": "^0.6.1"`, introduced by `d63df18`) — not in the published 0.6.1, but it ships on the next publish unless removed with `npm rm @ruco-dev/xtage`
- **11 commits unpushed**, including the CI workflow itself; `npm whoami` → 401 and the env `GITHUB_TOKEN` is invalid and shadows a working keyring account, so both the publish and the push are credential-blocked
- `xtage context` and `xtage link` appear in `--help` but in no README section

> **Corrected 2026-08-16:** the previous "deprecation message is still `*` for versions 0.5.0+ / re-run with OTP" gap was a phantom — versions 0.5.0+ never existed on `@ruco-ai/xtage`, and all 7 that do carry the correct message.
>
> Full evidence: `.flowdeck/.crunchdeck/prepare-to-publish/AUDIT.md` (2026-08-16 play — NOT READY, 4 blockers / 8 warnings; all 5 blockers from the 2026-08-15 play verified closed). Prior runs: `.flowdeck/_meld/2026-08-15-prepare-to-publish/AUDIT.md`.
