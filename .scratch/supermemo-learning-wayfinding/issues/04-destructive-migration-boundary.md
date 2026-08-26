# Destructive Learning Migration Boundary

Type: grilling
Status: resolved

## Question

Given the user's permission for a destructive migration, what exactly is discarded, when does the migration run, and how does the application recover safely?

Decide:

- whether the migration resets only learning tables, replaces the learning schema generation, or rebuilds the entire local database;
- whether Note content, CardTopic content, CardID/source identity, and personal Review Events are retained, transformed, or intentionally removed;
- startup detection and behavior for old databases, partially migrated databases, stale renderer state, and malformed records;
- whether users get a one-time warning, backup/export option, or an explicit reset action;
- the rollback/recovery boundary and acceptance criteria for a clean new install and an existing install.

The answer must not introduce forward-compatibility code by assumption; it must state the chosen destructive boundary and its operational consequences.

## Answer

This work is happening before the feature has shipped. Treat the change as a direct in-place development refactor:

- Do not add a migration path, compatibility layer, schema-generation bump, or `PRAGMA user_version` change for this effort.
- Change the current Learning tables/contracts directly to the new Reading Item and Highlight-as-Extract model. Existing local development databases with the old shape are not supported; developers may remove/recreate them manually when needed.
- Do not have application code silently delete the entire main database or silently replace an incompatible database with an empty one. Note/Loro content remains outside the intended learning reset boundary during normal development.
- Do not add a one-time end-user warning, mandatory backup/export step, or startup migration flow because there is no released user data to protect in this pre-release state.
- If the current database cannot initialize against the edited schema, fail Learning/storage initialization explicitly with the existing error/reporting path. Do not continue with an empty queue or fabricated defaults.

The operational consequence is deliberate: implementation may alter or drop existing `learning_*` structures and current learning data in a developer database, but it must preserve the Note content model and keep failure visible. Before any future public release, a separate migration/backup decision is required; it is outside this map's destination.

This decision must be reflected in the implementation ticket: update the schema and contracts directly, remove obsolete CardTopic/Highlight learning assumptions, and verify clean-install plus explicit schema-failure behavior. No migration tests are required for an unreleased path, but focused schema initialization and failure tests remain necessary for the new direct model.
