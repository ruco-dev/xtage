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
