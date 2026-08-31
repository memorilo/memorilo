# Management Web SSR Framework Research

Research date: 2026-08-29

## Decision

Do not introduce TanStack Start or Next.js for the initial Sync Server management web. Keep Hono as the single management HTTP/API composition boundary and React/Vite as the client toolchain. If server rendering is desired, use Hono's official `@hono/react-renderer` for **limited, non-streaming React SSR plus client hydration**.

This gives registration, login, pairing, account status, and destructive-confirmation pages an immediately rendered document without creating a second application framework or a parallel authentication/API model. It does not change the public listener topology: the reverse proxy still routes ordinary HTTPS to Hono and libp2p WebSocket upgrades to the separately owned libp2p listener.

SSR is an optional presentation optimization, not a security boundary. Hono browser-session middleware and the shared authentication/domain services must authorize every management read and mutation, including step-up and destructive actions. Route rendering may consume the resulting typed request context but must not replace API-level authorization.

## Why Hono Is Sufficient

- `@hono/node-server` adapts a Hono Fetch handler to Node, returns the underlying Node server for lifecycle control, and serves static files through its Node adapter. That matches the planned Effect-owned Hono listener and explicit shutdown sequence without another server runtime ([Hono Node.js adapter](https://hono.dev/docs/getting-started/nodejs)).
- Hono's official React renderer uses React/ReactDOM, supports request-context access, normal SSR, and optional Suspense streaming. Its peer range is React 19, matching this repository's React 19.2.8. Streaming is explicitly unavailable under Vite or Vitest, so the launch contract should be non-streaming SSR; streaming would require a separate production/test design ([React renderer README](https://github.com/honojs/middleware/tree/main/packages/react-renderer), [package manifest](https://github.com/honojs/middleware/blob/main/packages/react-renderer/package.json)).
- Hono's official Vite build plugin can emit a Node server bundle and separately build client assets. Hono's own example uses two Vite builds for the client and server, which is enough to add a `hydrateRoot` client entry without adopting a meta-framework ([Hono Vite build](https://github.com/honojs/vite-plugins/tree/main/packages/build), [Hono Vite client example](https://github.com/honojs/examples/tree/main/hono-vite-jsx)).
- The workspace already uses Hono 4.13.2, Vite 7, React 19.2.8, StyleX, TanStack Router, and public `@memorilo/ui`; neither TanStack Start nor Next.js is installed ([desktop API](../../../apps/desktop/api/package.json), [renderer](../../../apps/desktop/renderer/package.json), [UI package](../../../packages/ui/package.json)). The public UI components use browser globals mainly in effects or guarded portal boundaries, so they are broadly compatible with SSR, but each management-web consumer still needs hydration checks.

Hono's own JSX renderer is not the recommended renderer here because `@memorilo/ui` is React. The official React renderer avoids replacing or duplicating the shared component library. A hand-rolled `react-dom/server` integration would offer no useful advantage over that middleware and would leave the same routing, manifest, hydration, CSP, and error-handling work to the application.

## SSR Value for This Product

The management web is an authenticated operational console, not a marketing or publishing surface. There is no SEO requirement, and most useful content depends on the current session and fresh account state. SSR can improve first-content display and avoid a blank client bootstrap on login, pairing, and status pages, but it does not make later dashboard interactions cheaper and it adds hydration invariants and a server/client build split.

Use SSR only for the initial route document and initial safe view model. Keep live status, pairing progress, mode changes, device revocation, reset-job progress, and destructive operations behind the typed Hono API. Never serialize password hashes, device credentials, step-up secrets, invite plaintext, or unrestricted domain entities into hydration state.

The practical launch shape is:

```text
public HTTPS/WSS :443
  ordinary HTTP -> Hono Node listener
    /api/*       -> authenticated management API
    /assets/*    -> Vite-built static assets
    pages        -> non-streaming React SSR, then hydration
  WS Upgrade     -> libp2p WebSocket listener
```

SSR does not let Hono and `@libp2p/websockets` share an internal socket; the prior reverse-proxy decision remains unchanged.

## TanStack Start Evaluation

TanStack Start is technically viable and is the preferred fallback if the management web later becomes a large full-stack React application:

- Its server entry is a standard `fetch(Request)` handler and accepts typed request context, so an authenticated account context can be passed into SSR, middleware, routes, and server functions ([server entry point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)).
- It performs SSR by default and supports per-route `true`, `false`, and `data-only` rendering. Its own SPA guide says applications without SEO, crawler, or performance reasons can intentionally avoid SSR and retain server functions/routes ([Selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr), [SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode)).
- Its security guidance says route guards are UX/navigation controls, not authorization boundaries; every server function, server route, and API endpoint must enforce authorization. Defining a custom Start entry also requires deliberate CSRF middleware configuration ([authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication), [middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)).
- For Vite on Node, the current official deployment path adds Nitro and emits `.output/server/index.mjs`; the docs say the Nitro/Vite integration is under active development. The clearer custom-Node path described for Rsbuild emits separate client/server artifacts and forwards requests into a Fetch-style entry ([hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)).

For this server, Start would therefore add its route build, SSR entry, server-function protocol, middleware rules, and Nitro or another Node adapter around an already sufficient Hono API. Using Start server functions alongside Hono would create two management RPC surfaces; routing Start only for pages would pay most framework cost while using little of its value. Do not adopt it until route-level loaders/actions, selective SSR, or streaming become a demonstrated need. If that threshold is reached, embed its Fetch handler behind the existing Hono/Node front door and keep Hono/shared domain services authoritative.

## Next.js Evaluation

Next.js is a poor fit for this topology even though it can self-host on Node:

- Next.js recommends its integrated server and says a custom server should be used only when its router cannot meet requirements. A custom server cannot be combined with `output: 'standalone'`, and the custom server file is outside the Next compiler/bundle ([custom server](https://nextjs.org/docs/app/guides/custom-server)).
- Standalone output produces its own minimal `server.js`. In a monorepo, files outside the Next project root require explicit tracing-root/include configuration, which matters for shared Memorilo packages and native/runtime assets ([output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)).
- Self-hosted multi-instance deployments introduce Next-specific cache coordination, build/deployment IDs, Server Action encryption keys, version-skew behavior, and proxy streaming settings. These are real operational contracts with no corresponding need in the current console ([self-hosting](https://nextjs.org/docs/app/guides/self-hosting)).
- Next's authentication guidance still requires checks close to the data source and treats Server Actions and Route Handlers as public API endpoints. Layout/UI checks do not protect nested work ([authentication](https://nextjs.org/docs/app/guides/authentication)).

The clean Next deployment would be an additional internal Next listener beside Hono and libp2p, with same-origin proxy routing and duplicated runtime composition. Co-locating it through a custom Node server sacrifices standalone packaging and complicates Hono/Effect lifecycle ownership. Neither shape improves the one-external-port guarantee or shared-auth design.

## Revisit Conditions

Re-evaluate TanStack Start, not Next.js, only if at least one of these becomes concrete:

- the console gains enough nested routes and route-owned data dependencies that application-maintained SSR loaders/hydration become a recurring source of defects;
- measured first-content latency over target deployments is unacceptable after a small Hono SSR shell and asset optimization;
- selective SSR, streaming Suspense, or server-rendered public/account content becomes a product requirement;
- the team intentionally replaces the Hono management API with one full-stack request model rather than operating both Hono API routes and framework server functions.

Until then, Hono + React/Vite with bounded SSR has the smallest artifact, listener, authentication, and lifecycle surface while preserving `@memorilo/ui` reuse.
