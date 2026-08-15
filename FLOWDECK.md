# Project

## Vision

xtage gives Claude persistent, semantic knowledge of a codebase — across every session, without manual context-setting. It maintains a knowledge base in `~/xtage/` (REPO.md, CODEINDEX.md, per-file chunk summaries) and enforces consultation via deterministic Claude Code hooks before agents touch source files.

## Current state

- MCP server with full read/write/fetch/registry tool suite
- Per-file chunk summaries (`write_file_chunk`, `read_file_chunk`, `list_file_chunks`)
- Session token tracking (`get_session_stats`)
- Claude memory sync (`sync_from_claude_memory`)
- **stagehand hook layer** (`xtage install`): gate/flag/clear/dirty hooks wired into `.claude/settings.local.json`; SessionStart digest injection; git post-commit auto-update
- Published as `@ruco-dev/xtage` (moved from `@ruco-ai/xtage` in 0.6.0; the unscoped name `xtage` is permanently blocked by npm's similarity check); `.npmignore` excludes `.flowdeck/` and other internal files

## Known gaps

- No xtage index exists for the xtage repo itself yet — run `xtage init` to bootstrap; gate currently fails-open everywhere
- git post-commit hook spawns a Claude session on every commit (including in this repo) — needs a guard when no index exists
- Before/after token stat comparison not yet captured (requires interactive sessions)
- **`0.6.1` is unpublished — npm still serves `0.6.0`, which pins `adm-zip@^0.5.16` and carries a runtime high (GHSA-xcpc-8h2w-3j85). Publishing `0.6.1` is the fix; see `.flowdeck/.crunchdeck/security-findings/VULN-AUDIT.md`**
- `package-lock.json` is gitignored and untracked, so installs are not reproducible from a fresh clone and bounded `npm audit fix` is unsafe (no revert target)
- `@ruco-ai/mcpster` is deprecated upstream ("Renamed to mcpster") while still a runtime dependency in four source files; `minimatch` is declared but imported nowhere
