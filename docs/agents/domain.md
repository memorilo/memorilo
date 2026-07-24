# Domain Docs

This repository uses a multi-context domain documentation layout.

## Before exploring

- Read the root `CONTEXT-MAP.md` when it exists.
- Follow it to each relevant context's `CONTEXT.md`.
- Read relevant system-wide ADRs under `docs/adr/`.
- Read relevant context-specific ADRs beside each context.

If these files do not yet exist, proceed silently. The domain-modeling workflow creates them when domain terminology or architectural decisions are established.

## Expected structure

```text
/
|-- CONTEXT-MAP.md
|-- docs/adr/
|-- apps/
|   `-- desktop/
|       |-- CONTEXT.md
|       `-- docs/adr/
`-- packages/
    |-- editor/
    |   |-- CONTEXT.md
    |   `-- docs/adr/
    `-- e2e/
        |-- CONTEXT.md
        `-- docs/adr/
```

The context map decides which directories represent independent domain contexts. A workspace package does not automatically need its own context document.

## Vocabulary

Use terminology defined in the relevant `CONTEXT.md`. Avoid introducing synonyms that conflict with the project glossary.

## ADR conflicts

If proposed work contradicts an existing ADR, identify the conflict explicitly instead of silently overriding the decision.
