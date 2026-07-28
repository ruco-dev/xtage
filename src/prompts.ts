/**
 * MCP prompt definitions.
 * Per Anthropic long-context guidance: instructions go LAST (after content).
 */
import type { McpsterServer } from "@ruco-ai/mcpster"

export function buildRepoInitPrompt(args: { repo_url?: string; local_path?: string; repo_name?: string }): string {
  const repoUrl = args.repo_url
  const localPath = args.local_path
  const repoName = args.repo_name ?? 'this repository'
  const now = new Date().toISOString()

  const fetchInstruction = repoUrl
    ? `Call fetch_repo_data with url="${repoUrl}" and chunk_index=1.\n\nThen keep calling fetch_repo_data with incrementing chunk_index until has_more is false. Accumulate all files across all chunks before writing anything.`
    : `Call fetch_local_repo_data with local_path="${localPath}" and chunk_index=1.\n\nThen keep calling fetch_local_repo_data with incrementing chunk_index until has_more is false. Accumulate all files across all chunks before writing anything.`

  const repoRef = repoUrl ?? localPath ?? 'local'

  return `You are generating a persistent semantic index for ${repoName}.

## Step 1 — Fetch all chunks

${fetchInstruction}

## Step 2 — Generate REPO.md (from chunk 1 files only)

Using the files from chunk 1, call write_repo_md with the following structure:
- What This Repo Does: one clear paragraph (problem, users, primary flow)
- Architecture Overview: key components and relationships, ASCII diagram if helpful
- Directory Structure: actual structure from the files
- Key Patterns & Conventions: language, framework, test approach, error handling, naming, commit style
- Entry Points: where execution starts / requests enter
- External Dependencies & Integrations: third-party dependencies and their purpose
- What to Avoid: anti-patterns and known pitfalls you infer from the code

## Step 3 — Generate CODEINDEX sections (all chunks)

For every file across all chunks, generate a CODEINDEX section:

## \`path/to/file\`

**Role:** One sentence — what this file *does* in the system (its job, not its contents).

**Key symbols:**
- \`symbolName(args) → ReturnType\` — what it does, when to use it, side effects if any

**Depends on:** other repo files this imports from (skip external packages)
**Depended on by:** repo files that import from this one (infer from the code)
**Last updated:** ${now}

---

Rules:
- Be behavioural, not syntactic. "Orchestrates authentication flow" not "contains AuthService class"
- Include only symbols a caller needs to know about (skip internal helpers)
- If a file is a config or data file, describe what it configures and who reads it
- Do not invent symbols or dependencies not present in the provided content

## Step 4 — Write CODEINDEX.md

Call write_codeindex with the full assembled CODEINDEX.md including frontmatter:

\`\`\`
---
repo_url: ${repoRef}
last_indexed: ${now}
tool_version: 0.1.0
---
\`\`\``
}

export function buildRepoUpdatePrompt(args: { repo_name?: string; changed_files?: string; changed_symbols?: string }): string {
  const repoName = args.repo_name ?? 'this repository'
  const changedFiles = args.changed_files ?? '(see diff below)'
  const changedSymbols = args.changed_symbols ?? ''

  return `You are incrementally updating the CODEINDEX.md for ${repoName}.

Changed files in this commit: ${changedFiles}
${changedSymbols ? `Changed symbols detected: ${changedSymbols}` : ''}

The git diff and current CODEINDEX sections for changed files are provided below.

## Instructions

For each changed file:

1. **Small change** (symbol-level): Update only the affected \`Key symbols\` entry in place. Preserve everything else in the section exactly.

2. **Large change** (file restructured, role changed, many symbols altered): Call get_file to fetch the full current file content, then retranslate the entire section from scratch.

3. **Deleted file**: Remove its CODEINDEX section entirely.

4. **New file**: Generate a new section following the repo-init format.

Rules:
- Only touch sections for changed files — preserve all other sections character-for-character
- Update \`Last updated\` timestamp only on sections you modify
- After all sections are updated, update the \`last_indexed\` frontmatter field to: ${new Date().toISOString()}
- Call write_codeindex with the complete updated CODEINDEX.md content`
}

export function buildSessionStartPrompt(args: { repo_name?: string }): string {
  const repoName = args.repo_name ?? ''
  const repoLine = repoName ? ` for ${repoName}` : ''

  return `Before answering any questions${repoLine}, load your codebase context:

1. Read xtage://index — your semantic code index
2. Read xtage://project-insights — project-specific knowledge
3. Read xtage://general-insights — transferable patterns

Then call check_for_updates. If stale (commits_behind > 0), inform the user:
"Your index is N commits behind. Run \`xtage update\` to sync, or I'll work with the current index."

Do not summarise what you read. Silently absorb the context and answer the user's first question with it already loaded.`
}

export function buildSessionEndPrompt(args: { repo_name?: string }): string {
  const repoName = args.repo_name ?? 'this repository'

  return `This session is ending. Reflect on what was learned and write any new insights.

## Classification rules

**→ PROJECTINSIGHTS.md** (write via write_project_insights):
- Non-obvious behaviour or surprising implementation choices in ${repoName}
- Decisions already made that should not be relitigated
- Deploy/ops knowledge not in the README
- Known issues or technical debt discovered
- Refactoring approaches that would work (or wouldn't)

**→ GENERALINSIGHTS.md** (write via write_general_insights):
- Patterns applicable beyond this repo (language-agnostic or framework-specific)
- Lessons about test approaches, refactoring strategies, architecture choices
- Anti-patterns observed that consistently cause problems

## Process

1. Read the current PROJECTINSIGHTS.md and GENERALINSIGHTS.md (via xtage://project-insights and xtage://general-insights)
2. Identify what was genuinely learned this session — ignore routine operations
3. Deduplicate against existing entries in both files
4. If nothing new: skip all writes
5. If new entries exist: append them in the correct section of the appropriate file and call the write tool

Format for new GENERALINSIGHTS entries:
**[Short title]** \`[language/framework tag]\`
**What:** One sentence.
**When:** When to apply it.
**Example:** Brief example or pointer.
**Source:** Discovered in ${repoName} on ${new Date().toISOString().slice(0, 10)}.

Format for new PROJECTINSIGHTS entries: plain bullet under the relevant section heading.`
}

export function registerPrompts(server: McpsterServer): void {
  server.definePrompt({
    name: 'repo-init',
    description: 'Fetch and index a GitHub repository. Provide repo_url and optionally repo_name.',
    handler: async (args) => buildRepoInitPrompt({ repo_url: args.repo_url ?? '', repo_name: args.repo_name }),
  })

  server.definePrompt({
    name: 'repo-update',
    description: 'Instructions for incremental CODEINDEX update after a git commit.',
    handler: async (args) => buildRepoUpdatePrompt({
      repo_name: args.repo_name,
      changed_files: args.changed_files,
      changed_symbols: args.changed_symbols,
    }),
  })

  server.definePrompt({
    name: 'session-start',
    description: 'Load codebase context at session start. Run this before your first answer.',
    handler: async (args) => buildSessionStartPrompt({ repo_name: args.repo_name }),
  })

  server.definePrompt({
    name: 'session-end',
    description: 'Reflect on session learnings and write new insights to the appropriate files.',
    handler: async (args) => buildSessionEndPrompt({ repo_name: args.repo_name }),
  })
}
