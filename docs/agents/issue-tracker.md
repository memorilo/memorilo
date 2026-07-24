# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create issues with `gh issue create`.
- Read issues and comments with `gh issue view <number> --comments`.
- List and filter issues with `gh issue list`.
- Comment with `gh issue comment`.
- Apply or remove labels with `gh issue edit`.
- Close issues with `gh issue close`.
- Infer the repository from the current Git remote.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve ambiguous references using `gh pr view`, falling back to `gh issue view`.

## Publishing

When a skill says "publish to the issue tracker", create a GitHub issue.

When a skill says "fetch the relevant ticket", run:

`gh issue view <number> --comments`

## Wayfinding operations

- Maps are GitHub issues labelled `wayfinder:map`.
- Child tickets use GitHub sub-issues when available, otherwise task-list links.
- Ticket types use `wayfinder:<type>` labels.
- Blocking uses GitHub native issue dependencies when available.
- The frontier contains open, unassigned child tickets without open blockers.
- Claim tickets with `gh issue edit <number> --add-assignee @me`.
- Resolve tickets by commenting, closing, and recording the resulting context in the map.
