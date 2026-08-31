# Sync Server Management Web Prototype

Throwaway UI prototype for the management-web workflow ticket. It uses in-memory state only and must not be promoted directly into production.

Run from the repository root:

```sh
nix develop -c pnpm --filter @memorilo/desktop-renderer exec vite --config ../../.scratch/sync-server-wayfinding/prototypes/management-web/vite.config.ts
```

Open the printed URL and switch between `?variant=A`, `?variant=B`, `?variant=C`, and `?variant=D` with the floating bottom control or the left/right arrow keys. Variant A (Operations console) is the selected information architecture; the other variants are retained only as exploratory references.
