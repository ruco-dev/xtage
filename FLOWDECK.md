# Project

## Vision

xtage gives Claude persistent, semantic knowledge of a codebase — across every session, without manual context-setting. It maintains a knowledge base in `~/xtage/` (REPO.md, CODEINDEX.md, per-file chunk summaries) and enforces consultation via deterministic Claude Code hooks before agents touch source files.

## Current state

- MCP server with full read/write/fetch/registry tool suite
- Per-file chunk summaries (`write_file_chunk`, `read_file_chunk`, `list_file_chunks`)
- Session token tracking (`get_session_stats`)
- Claude memory sync (`sync_from_claude_memory`)
- **stagehand hook layer** (`xtage install`): gate/flag/clear/dirty hooks wired into `.claude/settings.local.json`; SessionStart digest injection; git post-commit auto-update
- `@ruco-dev/xtage@0.6.1` is latest on npm; `@ruco-ai/xtage` is fully deprecated — all 7 versions (0.1.0–0.4.0) carry the correct rename message. **Published 0.6.1 artifact** was cut from `a611566` and still declares `@ruco-ai/mcpster` + `minimatch`; the working tree is at `0.6.2` — see Known gaps
- `package-lock.json` is tracked — installs are reproducible; `npm audit --omit=dev` → 0 vulnerabilities
- `ruco-dev/xtage` is public on GitHub; tags `v0.6.0` and `v0.6.1` are pushed, but `origin/master` is behind local — CI workflow has never run
- `scripts/gen-version.mjs` + `prebuild` hook — `src/version.ts` is now generated from `package.json` on every build; VERSION drift cannot recur
- `prepack: "npm run build"` — `npm pack` always produces a complete `dist/`
- `.github/workflows/ci.yml` — CI runs install → build → binary-check → test → pack-check on every push
- Migrated from deprecated `@ruco-ai/mcpster` to unscoped `mcpster`; removed unused `minimatch` — in the working tree; ships in `0.6.2`
- Self-referential runtime dependency (`@ruco-dev/xtage` depending on itself) removed — ships in `0.6.2`
- `repository` and `bugs` fields added to `package.json`; CHANGELOG covers full history (0.3.x → 0.6.2); `## 0.6.2` lists all 11 commits not in the published 0.6.1 artifact
- README covers all user-facing commands including `xtage link` (§5) and `xtage context` (hook-internal, noted in CHANGELOG 0.5.0)
- `xtage init` auto-installs hooks; verifies index written before reporting success; registers xtage MCP server for its subprocess; `last_indexed` stamped at write time

## Known gaps

- No xtage index exists for the xtage repo itself yet — run `xtage init` to bootstrap; gate currently fails-open everywhere
- git post-commit hook spawns a Claude session on every commit (including in this repo) — needs a guard when no index exists
- Before/after token stat comparison not yet captured (requires interactive sessions)
- **`0.6.2` not yet published** — self-dep removed, version bumped, CHANGELOG rewritten, 24 tests pass; awaiting `npm publish` + `git push origin master --follow-tags`. Post-publish: run `npm view @ruco-dev/xtage dependencies` to confirm no `@ruco-ai/mcpster`, no `minimatch`, no self-reference

> **Corrected 2026-08-16:** the previous "deprecation message is still `*` for versions 0.5.0+ / re-run with OTP" gap was a phantom — versions 0.5.0+ never existed on `@ruco-ai/xtage`, and all 7 that do carry the correct message.
>
> Full evidence: `.flowdeck/.crunchdeck/prepare-to-publish/AUDIT.md` (2026-08-16 play — NOT READY, 4 blockers / 8 warnings; all 5 blockers from the 2026-08-15 play verified closed). Prior runs: `.flowdeck/_meld/2026-08-15-prepare-to-publish/AUDIT.md`.
