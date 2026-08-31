# Protocol and Node Composition Research

Type: research
Status: resolved

## Question

What concrete refactor and runtime composition are required to let the existing desktop node keep TCP/mDNS P2P while also dialing a multi-tenant Sync Server over WebSocket, and to expose Hono web/API plus libp2p through one external HTTPS/WSS port?

Establish repository and primary-source facts for:

- reusable versus paired-device-specific portions of `@memorilo/sync` framing, session, protocol, transport, discovery, and lifecycle code;
- current `@libp2p/websockets` listen/dial and existing-server integration constraints;
- viable one-external-port routing shapes without dependency patching;
- protocol versioning, strict decoding, frame/stream limits, backpressure, reconnect, graceful drain, and peer-role authentication seams;
- Effect services/Layers and resource scopes that match repository conventions.

Write the findings to `../research/protocol-and-node-composition.md`, cite primary sources and local public APIs, append the asset link under `## Answer`, and mark this ticket resolved.

## Answer

[Protocol and Node Composition Research](../research/protocol-and-node-composition.md) establishes the required transport-neutral `/memorilo/sync/1` extraction, dual-transport desktop and WebSocket-only server composition, reverse-proxy single-port topology, bounded protocol/resource defaults, Effect lifecycle graph, and layered test method.
