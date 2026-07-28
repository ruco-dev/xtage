# xtage — Ecosystem SPEC

## Vision

xtage is a distributed knowledge network for Claude instances. Every Claude session — across every user and project — contributes what it learns back to shared hubs. Future Claude sessions pull that knowledge as context, performing better because of the work done before them.

The core loop:

```
Claude works → generates insight → pushes to hub → future Claude pulls it → works better → repeat
```

xtage is not a single product. It is an ecosystem of four independent tools that can be used standalone or together.

---

## The Four Projects

### mcpster — MCP SDK
**Role:** Agnostic TypeScript SDK for building MCP servers. Removes boilerplate for stdio transport, JSON-RPC, tool/resource/prompt registration, and error handling.

**Independence:** Knows nothing about xtage, mdblu, or navg8. Any project can use it.

**Repo:** ruco-ai/mcpster

---

### xtage — Knowledge Store + Context Provider
**Role:** An MCP server that gives Claude a persistent, cross-project knowledge layer. Claude pushes insights during work; future Claude instances pull them as context.

**Independence:** Works without mdblu or navg8. Built with mcpster.

**Repo:** ruco-ai/xtage

---

### mdblu — Template Registry
**Role:** A community-maintained repository of markdown templates (SPEC, MISSION, ADR, ARCHITECTURE, etc.). Available as a CLI for humans and as an MCP server for Claude instances.

**Independence:** Fully standalone. The repo works without any other xtage project. The MCP server is built with mcpster but mdblu does not depend on xtage or navg8.

**Repo:** ruco-ai/mdblu

---

### navg8 — Workflow Manager
**Role:** GitHub-issue-driven mission orchestration. Generates structured planning documents from issues, executes them with Claude Code, tracks completion. Contributes mission insights to xtage on completion.

**Independence:** Works without xtage (insights are skipped gracefully). Uses mdblu templates but falls back if unavailable. Built with mcpster for its MCP surface.

**Repo:** ruco-ai/navg8

---

## Dependency Graph

```
mcpster     ← no dependencies on other xtage projects
mdblu       ← uses mcpster (for MCP server mode)
xtage       ← uses mcpster; emits PRs to mdblu; accepts navg8 insights
navg8       ← uses mcpster; pulls from mdblu; pushes to xtage
```

All dependencies are optional at runtime. Each project degrades gracefully without the others.

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

Raw insights are not curated by a backend — they are curated by Claude instances. The flow:

```
Claude pulls raw insights (recent, unreviewed)
Claude pulls context from current task
Claude deduplicates, elevates, discards noise
Claude pushes back use-ready (curated) insights
```

The store stays dumb — append-only, queryable by type/scope/recency. Curation is a task Claude can be explicitly asked to perform: "review this week's raw insights and promote the useful ones."

---

## mdblu PR Mechanic

When xtage detects that a template insight has been independently suggested multiple times across users/projects, it opens a PR to the mdblu repository with the proposed template change. A human maintainer reviews and merges or rejects.

This keeps mdblu community-curated and human-reviewed while allowing xtage's collective intelligence to feed into it.

---

## The xtage CLI — Entry Point

```bash
npx xtage setup
```

This single command:
1. Registers the xtage MCP server with Claude Code
2. Instructs Claude to pull templates from mdblu when needed
3. Instructs Claude to pull project/task context from xtage
4. Instructs Claude to push insights after each session

After setup, Claude's behavior is augmented by default. No manual context passing required.

---

## Build Order

```
mcpster → xtage + mdblu (parallel) → navg8
```

mdblu v1 is primarily a repo and thin CLI — no MCP dependency. Can be started immediately alongside mcpster.

---

## Versioning Philosophy

Each project versions independently. Breaking changes in mcpster follow semver. Projects built on mcpster declare a peer dependency range. No lockstep releases.

---

## Non-Goals (Ecosystem v1)

- No authentication between Claude instances
- No real-time collaboration or shared sessions
- No GUI or dashboard
- No private/enterprise knowledge isolation
- navg8 upgrade deferred until mcpster is stable

---

## Evolution Path

```
v1  mcpster ships → mdblu CLI + repo launches → xtage ships with ingest + query
v2  mdblu MCP server → xtage PR emission to mdblu → navg8 upgrade
v3  xtage hosted option → public knowledge pool across all users
v4  navg8 fully MCP-native → mission insights feed xtage automatically
```
