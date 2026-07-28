# TEST-PLAN: Session Tracking & Tokensonomy

## Scope

Manual verification of session read logging, token savings stats, frontmatter injection/stripping, and tag-based filtering introduced in `src/sessions.ts` + changes to `src/tools.ts` and `src/store.ts`.

## Prerequisites

- [ ] `npm run build` passes with no errors
- [ ] xtage MCP server registered and running in Claude Code
- [ ] At least one repo registered via `register_repo`
- [ ] At least one file chunk written via `write_file_chunk`

---

## Test Cases

### TC-01: write_file_chunk stores frontmatter

**Setup:** A repo `testrepo` is registered.
**Steps:**
1. Call `write_file_chunk` with `repo_name="testrepo"`, `filename="src-index.ts.md"`, `content="Exports the main entry point."`, `original_tokens=980`, `tags=["api","entry"]`
2. Inspect `~/xtage/testrepo/files/src-index.ts.md`

**Expected:** File starts with:
```
---
original_tokens: 980
tags: api, entry
---

Exports the main entry point.
```
**Pass criteria:** Frontmatter block present and content intact below it.

---

### TC-02: write_file_chunk without optional params omits frontmatter

**Steps:**
1. Call `write_file_chunk` with only `repo_name`, `filename`, `content` (no `original_tokens`, no `tags`)
2. Inspect the written file

**Expected:** File starts directly with the prose content — no `---` block.
**Pass criteria:** No frontmatter present.

---

### TC-03: read_file_chunk strips frontmatter and returns clean content

**Setup:** TC-01 chunk written to disk.
**Steps:**
1. Call `read_file_chunk` with `repo_name="testrepo"`, `filename="src-index.ts.md"`

**Expected:** Response `content` = `"Exports the main entry point."` (no `---` lines). Response also includes `original_tokens: 980` and `summary_tokens: <N>`.
**Pass criteria:** Content is clean prose; metadata fields present.

---

### TC-04: read_file_chunk logs to session and flushes to disk

**Setup:** TC-01 chunk written.
**Steps:**
1. Call `read_file_chunk` for the chunk above
2. Inspect `~/xtage/testrepo/sessions/` — a JSON file should exist

**Expected:** Session JSON contains an entry `{ type: "chunked", file: "src-index.ts.md", summary_tokens: <N>, original_tokens: 980 }`.
**Pass criteria:** Session file created; entry fields correct.

---

### TC-05: get_session_stats returns savings after a chunked read

**Setup:** TC-04 completed (one chunked read logged).
**Steps:**
1. Call `get_session_stats` with `repo_name="testrepo"`

**Expected:** Response includes `chunked_reads: 1`, `estimated_saved: <positive number>`, `savings_pct: <0-100>`.
**Pass criteria:** `estimated_saved = original_tokens - summary_tokens`; `savings_pct` is a rounded integer.

---

### TC-06: get_file logs raw read when repo_name provided

**Steps:**
1. Call `get_file` with a valid `path`, `repo_url`, and `repo_name="testrepo"`
2. Call `get_session_stats` with `repo_name="testrepo"`

**Expected:** Stats show `raw_reads: 1` and `raw_tokens: <file token count>`.
**Pass criteria:** Raw read appears alongside chunked reads in stats.

---

### TC-07: get_file without repo_name does not error

**Steps:**
1. Call `get_file` with only `path` and `repo_url` (no `repo_name`)

**Expected:** File returned normally; no session entry written; no error thrown.
**Pass criteria:** Tool succeeds; session stats unaffected.

---

### TC-08: list_file_chunks returns tags and original_tokens

**Setup:** TC-01 chunk written.
**Steps:**
1. Call `list_file_chunks` with `repo_name="testrepo"`

**Expected:** Response includes `{ filename: "src-index.ts.md", tags: ["api", "entry"], original_tokens: 980 }`.
**Pass criteria:** Tags and token count surfaced per chunk.

---

### TC-09: list_file_chunks tag filter

**Setup:** Two chunks written — one with `tags=["api"]`, one with `tags=["tests"]`.
**Steps:**
1. Call `list_file_chunks` with `repo_name="testrepo"`, `tag="api"`

**Expected:** Only the `api`-tagged chunk returned.
**Pass criteria:** Non-matching chunk excluded.

---

### TC-10: read_file_chunk on chunk with no frontmatter (legacy chunk)

**Setup:** A chunk file written directly (no frontmatter) before this feature.
**Steps:**
1. Call `read_file_chunk` on it

**Expected:** Content returned as-is; `original_tokens` absent from response; session entry logged with `original_tokens: null`.
**Pass criteria:** No crash; graceful degradation; `estimated_saved` is `null` in stats.

---

### TC-11: write_file_chunk re-write is idempotent on frontmatter

**Setup:** TC-01 chunk exists.
**Steps:**
1. Call `write_file_chunk` again on same file with different `original_tokens=1200`, same content

**Expected:** File updated; frontmatter reflects new `original_tokens: 1200`; no doubled `---` blocks.
**Pass criteria:** Single frontmatter block; new value present.

---

## Regression Checks

- [ ] `fetch_repo_data` still chunks and returns files correctly (unchanged path)
- [ ] `read_codeindex` / `read_repo_md` / `read_project_insights` unaffected
- [ ] `check_for_updates` still reads `last_indexed` frontmatter correctly
- [ ] `register_repo` / `lookup_repo` unaffected

## Known Gaps

- No automated tests; all verification is manual via MCP tool calls
- `fetch_repo_data` raw reads not logged (scope deferred — initial fetch, not browsing)
- Session boundaries are process-scoped; a crashed/restarted server starts a new session with no continuity
- `savings_pct` is only meaningful when `original_tokens` was set at write time; older chunks show `null`
