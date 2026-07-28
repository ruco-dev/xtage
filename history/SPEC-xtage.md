# xtage — Ecosystem SPEC

## Vision

xtage=distributed knowledge net for Claude. Every session—any user, any project—contributes insights to shared hubs. Future sessions pull that context, perform better.

Core loop:

```
Claude works → generates insight → pushes to hub → future Claude pulls it → works better → repeat
```

xtage=not single product. Ecosystem of 4 independent tools, usable standalone or together.

---

## The Four Projects

### mcpster — MCP SDK
**Role:** Agnostic TS SDK for MCP servers. Removes boilerplate: stdio transport, JSON-RPC, tool/resource/prompt registration, error handling.

**Independence:** Knows nothing about xtage, mdblu, navg8.

**Repo:** ruco-ai/mcpster

---

### xtage — Knowledge Store + Context Provider
**Role:** MCP server giving Claude persistent cross-project knowledge. Claude pushes insights; future instances pull them.

**Independence:** Works without mdblu/navg8. Built with mcpster.

**Repo:** ruco-ai/xtage

---

### mdblu — Template Registry
**Role:** Community-maintained markdown template repo (SPEC, MISSION, ADR, ARCHITECTURE, etc.). CLI for humans + MCP server for Claude.

**Independence:** Fully standalone. MCP server built with mcpster; no xtage/navg8 dependency.

**Repo:** ruco-ai/mdblu

---

### navg8 — Workflow Manager
**Role:** GitHub-issue-driven mission orchestration. Generates planning docs from issues, executes with Claude Code, tracks completion. Pushes mission insights to xtage on completion.

**Independence:** Works without xtage (insights skipped gracefully). Uses mdblu templates, falls back if unavailable. Built with mcpster.

**Repo:** ruco-ai/navg8

---

## Dependency Graph

```
mcpster     ← no dependencies on other xtage projects
mdblu       ← uses mcpster (for MCP server mode)
xtage       ← uses mcpster; emits PRs to mdblu; accepts navg8 insights
navg8       ← uses mcpster; pulls from mdblu; pushes to xtage
```

All dependencies optional at runtime. Each project degrades gracefully without others.

---

## The Knowledge Flow

```
Claude (any project, any user)
    │
    ├── pulls context from xtage (insights by type/scope/recency)
    ├── pulls templates from mdblu (get_template, list_templates)
    ├── pulls repo/task context from xtage (current project data)
    │
    └── pushes insights to xtage after each task/commit/session
            │
            ├── stored in xtage knowledge store
            ├── surfaced to future Claude instances via MCP
            └── when template insights mature → xtage opens PR to mdblu
```

---

## Insight Types

Claude instances contribute typed insights:

| Type | Description | Example |
|---|---|---|
| `repo` | Observations about a codebase | "This repo uses a custom auth middleware pattern" |
| `task` | Learnings from completing a task | "Refactoring this module requires updating 3 dependent files" |
| `template` | Suggested improvements to mdblu templates | "SPEC template missing a Constraints section" |
| `mission` | navg8 mission outcomes and patterns | "Bug missions in this repo consistently require a regression test" |
| `general` | Coding patterns, conventions, anything reusable | "This team prefers explicit error types over exceptions" |

---

## Claude as the Aggregation Layer

Raw insights not curated by backend—curated by Claude instances:

```
Claude pulls raw insights (recent, unreviewed)
Claude pulls context from current task
Claude deduplicates, elevates, discards noise
Claude pushes back use-ready (curated) insights
```

Store stays dumb—append-only, queryable by type/scope/recency. Curation=explicit task: "review this week's raw insights and promote the useful ones."

---

## mdblu PR Mechanic

When xtage detects template insight suggested multiple times across users/projects → opens PR to mdblu with proposed change. Human maintainer reviews/merges/rejects. Keeps mdblu community-curated + human-reviewed while xtage collective intelligence feeds it.

---

## The xtage CLI — Entry Point

```bash
npx xtage setup
```

1. Registers xtage MCP server with Claude Code
2. Instructs Claude to pull templates from mdblu
3. Instructs Claude to pull project/task context from xtage
4. Instructs Claude to push insights after each session

After setup, Claude behavior augmented by default. No manual context passing.

---

## Build Order

```
mcpster → xtage + mdblu (parallel) → navg8
```

mdblu v1=primarily repo + thin CLI, no MCP dependency. Can start alongside mcpster.

---

## Versioning Philosophy

Each project versions independently. mcpster breaking changes follow semver. Dependents declare peer dependency range. No lockstep releases.

---

## Non-Goals (Ecosystem v1)

- No auth between Claude instances
- No real-time collaboration/shared sessions
- No GUI/dashboard
- No private/enterprise knowledge isolation
- navg8 upgrade deferred until mcpster stable

---

## Evolution Path

```
v1  mcpster ships → mdblu CLI + repo launches → xtage ships with ingest + query
v2  mdblu MCP server → xtage PR emission to mdblu → navg8 upgrade
v3  xtage hosted option → public knowledge pool across all users
v4  navg8 fully MCP-native → mission insights feed xtage automatically
```
