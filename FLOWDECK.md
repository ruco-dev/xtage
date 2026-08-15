# Project

## Vision

xtage gives Claude persistent, semantic knowledge of a codebase — across every session, without manual context-setting. It maintains a knowledge base in `~/xtage/` (REPO.md, CODEINDEX.md, per-file chunk summaries) and enforces consultation via deterministic Claude Code hooks before agents touch source files.

## Current state

- MCP server with full read/write/fetch/registry tool suite
- Per-file chunk summaries (`write_file_chunk`, `read_file_chunk`, `list_file_chunks`)
- Session token tracking (`get_session_stats`)
- Claude memory sync (`sync_from_claude_memory`)
- **stagehand hook layer** (`xtage install`): gate/flag/clear/dirty hooks wired into `.claude/settings.local.json`; SessionStart digest injection; git post-commit auto-update
- Published as `@ruco-dev/xtage` (moved from `@ruco-ai/xtage` in 0.6.0; the unscoped name `xtage` is believed blocked by npm's similarity check — unverified, since a lookup returns a plain 404 with no published versions and the check only fires at publish time); `.npmignore` excludes `.flowdeck/` and other internal files
- `package-lock.json` is tracked (`1b0d6e1`) — installs are reproducible from a fresh clone and `npm audit fix` has a revert target
- `ruco-dev/xtage` exists on GitHub and is **public**; `origin` points at it

## Known gaps

- No xtage index exists for the xtage repo itself yet — run `xtage init` to bootstrap; gate currently fails-open everywhere
- git post-commit hook spawns a Claude session on every commit (including in this repo) — needs a guard when no index exists
- Before/after token stat comparison not yet captured (requires interactive sessions)
- **`0.6.1` is unpublished — npm still serves `0.6.0`, which pins `adm-zip@^0.5.16` and carries a runtime high (GHSA-xcpc-8h2w-3j85). Publishing `0.6.1` is the fix; see `.flowdeck/.crunchdeck/security-findings/VULN-AUDIT.md`**
- `@ruco-ai/mcpster` is deprecated upstream ("Renamed to mcpster") while still a runtime dependency in four source files; `minimatch` is declared but imported nowhere
- **`origin/master` is 8 commits and 1 tag behind local** — the remote is still `0362af2 Initial commit`, so the security fix (`833d8db`) and tag `v0.6.1` are local-only. Both public artifacts (npm `latest` and GitHub) are the vulnerable ones
- `src/version.ts` is `0.6.0` while `package.json` is `0.6.1` — `xtage --version` and the MCP handshake misreport. `CHANGELOG.md:12` claims this was fixed in 0.6.0; it recurred at 0.6.1. Needs a structural fix (read from `package.json` or bump both in a release step)
- `README.md:27`'s *recommended* install line (`npx -- -y xtage`) resolves the unpublished unscoped name; `sync-memory` and `serve` are undocumented
- `@ruco-ai/xtage` is deprecated with the message literally `*` (the version range landed in the message slot), so old users are told nothing — `CHANGELOG.md:8` claims otherwise
- `dist/` is gitignored and `src/` is npmignored, so the tarball is whatever sits in the working dir at publish time. With no `.github/` workflows at all, nothing catches a stale or `dist`-less build — a `npm pack` on a fresh tree yields 9 files and a `bin` pointing at nothing (`prepublishOnly` covers `publish` only)
- npm/GitHub credentials are broken locally: `npm whoami` → 401, and an invalid `GITHUB_TOKEN` env var shadows a working keyring account — this is what blocks the publish and push above

> Full evidence: `.flowdeck/.crunchdeck/prepare-to-publish/AUDIT.md` (2026-08-15 run — NOT READY, 5 blockers, 11 warnings).
