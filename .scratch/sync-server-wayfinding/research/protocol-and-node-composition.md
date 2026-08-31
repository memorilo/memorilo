# Protocol and Node Composition Research

Research date: 2026-08-29

## Decision Summary

The existing desktop node can keep direct TCP/mDNS P2P and add a configured WebSocket route to a Sync Server, but `createP2pNode` must first be split into a transport-neutral protocol/session core and role-specific node adapters. The current session implementation is not a safe public-server boundary: authorization, peer scheduling, status, and state access all assume a `PairedDevice`, while decoding validates only the top-level `type`.

Use one **external** HTTPS/WSS port, not one in-process listener. A reverse proxy should own public TLS and port `443`, route ordinary HTTP to the loopback Hono listener, and route HTTP Upgrade requests to the loopback libp2p WebSocket listener. This uses only public APIs and needs no dependency patch. `@libp2p/websockets` creates and owns its own TCP and HTTP(S) listener; its exported configuration does not provide a supported way to attach that listener to Hono's existing Node server.

The concrete protocol direction is a new, strictly decoded `/memorilo/sync/1` protocol with an authenticated session context and explicit peer role/capabilities. Because this effort permits breaking changes and no prior release exists, no compatibility adapter is needed. Direct device-to-device synchronization remains a supported role and continues to work when the server is absent.

## Local Architecture Findings

### What is reusable

| Existing part | Reuse decision | Required change |
| --- | --- | --- |
| `SyncChange`, version-vector algorithms | Reuse as pure protocol/domain code | Move behind a transport-neutral public entry point and extend the change model for asset manifests/transfers. |
| Four-byte big-endian frame prefix and `maxSyncFrameBytes` | Reuse the framing concept | Replace the two private readers with one bounded incremental codec; make framed and unframed payloads unambiguous. |
| Initiator/responder pull, acknowledge, push, acknowledge ordering | Reuse as one session strategy | Express it as a state machine over an authenticated session context rather than `PairedDevice`. Relay and authoritative policies plug in behind the session service. |
| Noise, Yamux, identify | Reuse for both transports | Keep these in a configurable libp2p node factory. TLS protects the public proxy hop; Noise still authenticates/encrypts the libp2p connection. |
| TCP and mDNS | Keep for desktop direct P2P | Make transports and discovery injectable. Never enable mDNS in the server process. |
| `PairingManager` and local pairing protocol | Keep only as the device-to-device pairing adapter | Server pairing must resolve an account/device credential and cannot query the global paired-device store. |
| `@memorilo/effect-lifecycle` | Reuse for admission, drain, rollback, and compatibility with Promise-backed resources | Expose server services as Effect services/scoped Layers; use the existing operation supervisor/resource scope internally where it already supplies the needed behavior. |

Local evidence:

- [`P2pNodeOptions`](../../../packages/sync/src/node.ts#L31) accepts a single `PairingManager`; `SyncStateProvider.applyChanges` and acknowledgements receive `PairedDevice`, and the provider has no account/session context ([`node.ts`](../../../packages/sync/src/node.ts#L22)).
- Node creation hard-codes `tcp()`, `mdns()`, Noise, Yamux, and a TCP listen address ([`node.ts`](../../../packages/sync/src/node.ts#L253)). The same function also owns discovery, pairing probes, reconnect timers, sessions, status, and shutdown, so transport configuration alone is not a sufficient refactor.
- Incoming sync rejects a peer before opening a session unless it exists in `PairingManager`, then compares `pairingId` and `sharedSecret` from `hello` ([`node.ts`](../../../packages/sync/src/node.ts#L324), [`node.ts`](../../../packages/sync/src/node.ts#L505)). Server authorization needs to derive a tenant-scoped context instead.
- Outbound initiation is chosen by lexicographically comparing PeerIds, and reconnect enumerates only `pairing.list()` while dialing by PeerId ([`node.ts`](../../../packages/sync/src/node.ts#L285), [`node.ts`](../../../packages/sync/src/node.ts#L608)). A configured server endpoint therefore needs its own scheduler and explicit multiaddr; it must not be gated by PeerId ordering or mDNS peer-store state.
- The session, stream handlers, timers, event listeners, state-file persistence, and application pairing workflow all live in one file ([`node.ts`](../../../packages/sync/src/node.ts#L239), [`node.ts`](../../../packages/sync/src/node.ts#L687)). This is the primary extraction boundary.
- The public package root exports message types and codecs but not the private stream/session implementation; the Node-specific subpath exports the coupled implementation ([`index.ts`](../../../packages/sync/src/index.ts#L1)).
- Desktop composition already owns the lifecycle and closes the P2P application through a resource scope ([`desktop-runtime.ts`](../../../apps/desktop/main/src/desktop-runtime.ts#L342)). Its provider merges Note and Learning changes locally, which should remain the desktop storage adapter rather than becoming a server repository ([`desktop-runtime.ts`](../../../apps/desktop/main/src/desktop-runtime.ts#L350)).

### Public-boundary defects to fix during extraction

`decodeMessage` and `decodePairingMessage` parse JSON, check that `type` is a known literal, then cast the object to the union. They do not validate required fields, field types, version vectors, collection lengths, excess properties, payload size after decoding, or safe integer bounds ([`model.ts`](../../../packages/sync/src/model.ts#L199), [`model.ts`](../../../packages/sync/src/model.ts#L229)). The repository already has a strict Effect Schema pattern with `errors: "all"` and `onExcessProperty: "error"`; the new wire package should use that same public-boundary contract ([`wire.ts`](../../../apps/desktop/api/src/wire.ts#L6), [`wire.ts`](../../../apps/desktop/api/src/wire.ts#L158)).

The sync reader checks a declared length after four bytes, but repeatedly reallocates and copies its complete buffer. The pairing reader does not enforce `maxSyncFrameBytes` at all. A single large incoming chunk is also materialized before the declared length is rejected ([`node.ts`](../../../packages/sync/src/node.ts#L137), [`node.ts`](../../../packages/sync/src/node.ts#L172)). The new reader must retain at most `4 + maxFrameBytes`, reject an oversized length immediately after the header, avoid quadratic concatenation, and abort the stream on framing/decoding failure.

The current decoder accepts both a complete framed message and an unframed JSON payload, while the sync reader strips the prefix and the pairing reader passes it through. V2 should have exactly two layers: the frame codec always consumes/emits the prefix, and the message codec always consumes/emits the JSON payload.

## Required Refactor

### 1. Transport-neutral protocol module

Create a public package such as `@memorilo/sync-protocol` containing only:

- Effect Schemas and inferred types for the `/memorilo/sync/1` messages;
- version-vector and change identity rules;
- one bounded frame reader/writer over a minimal `SyncDuplex` interface;
- initiator/responder session state machines;
- typed protocol errors with stable tags/codes;
- role-neutral ports such as `authenticate`, `loadCursor`, `readBatch`, `applyBatch`, and `acknowledge`.

The package must not import libp2p, Electron, Hono, a database driver, or `PairingManager`. `@memorilo/sync` then adapts a public libp2p `Stream` to `SyncDuplex` and supplies the direct-device authentication/provider implementation. `apps/sync-server` supplies the multi-tenant authentication and relay/authoritative implementations.

Suggested core context:

```ts
interface AuthenticatedSyncPeer {
  accountId: AccountId
  deviceId: DeviceId
  peerId: string
  role: 'device' | 'server'
  mode: 'direct' | 'relay' | 'authoritative'
  generation: number
  membershipEpoch: number
}
```

`accountId`, mode, and generation must come from credential resolution and server policy, not from an untrusted field used directly as a repository partition key. Noise proves control of the libp2p PeerId; the application credential must bind that PeerId to the account and device.

### 2. Configurable libp2p factory

Extract node construction from discovery, pairing, session scheduling, and UI status. The factory should accept transports, listen/announce addresses, discovery modules, connection limits, stream muxer limits, and protocol handlers.

Desktop composition:

```text
transports:      tcp(), webSockets()
listen:          local TCP (existing behavior)
discovery:       mdns() for direct devices
outbound routes: PairedDevice scheduler + configured SyncServer scheduler
```

Server composition:

```text
transports:      webSockets()
listen:          /ip4/127.0.0.1/tcp/<internal-port>/ws
announce:        /dns4/<public-host>/tcp/443/tls/ws/p2p/<server-peer-id>
discovery:       none
inbound routes:  authenticated `/memorilo/sync/1` server sessions only
```

The desktop server scheduler must always dial the configured multiaddr, independent of `shouldInitiate`. Use bounded exponential backoff with jitter, reset after a successful connection/session, and classify failures: retry transport closure/timeouts; stop and surface credential revocation, disabled mode, protocol mismatch, and account policy rejection. Direct P2P retains its symmetric initiation rule separately.

For online relay, the server also needs an account-scoped registry of currently authenticated connections so it can open an outbound stream to another online device. This registry is ephemeral and bounded; it is not a recovery log. Disconnect/restart can lose an undelivered relay batch by design, and the UI must present that relay has no offline recovery.

### 3. Effect service graph and scopes

Recommended services are `SyncConfig`, `CredentialVerifier`, `AccountPolicy`, `SyncRepository`, `ObjectStore`, `SyncSessionService`, `Libp2pNode`, and `HonoServer`. Driver choices belong in Layers, so SQLite/PostgreSQL and filesystem/S3-compatible implementations do not branch inside session code.

Acquire every listener, database pool, object-store client, timer/scheduler, and session registry in a scoped Layer. Call `Effect.runPromise` once in the Node composition root. The local `createResourceScope` already gives startup rollback and reverse-order/aggregate cleanup ([`resource-scope.ts`](../../../packages/effect-lifecycle/src/resource-scope.ts#L72)); `createOperationSupervisor` already rejects new work and supports drain or interrupt shutdown ([`operation-supervisor.ts`](../../../packages/effect-lifecycle/src/operation-supervisor.ts#L20)). These are suitable implementation helpers while moving the public orchestration contract to Effect.

Shutdown order must be explicit:

1. Mark readiness false and close sync-session admission.
2. Stop server-endpoint reconnect schedulers and unregister/reject new protocol streams.
3. Stop accepting new Hono requests and new libp2p connections.
4. Drain admitted HTTP requests and sync sessions up to a configured deadline.
5. Abort remaining streams after the deadline, then stop libp2p.
6. Flush/close repositories and object-store resources last.

The libp2p `stop()` implementation closes listeners and open connections, so calling it before session drain would defeat graceful shutdown ([libp2p lifecycle source](https://github.com/libp2p/js-libp2p/blob/main/packages/libp2p/src/libp2p.ts)). Effect's official resource model uses scoped acquisition/finalization, and Layers describe construction and resource ownership ([Effect Scope](https://effect.website/docs/resource-management/scope/), [Effect Layers](https://effect.website/docs/requirements-management/layers/)).

## One External HTTPS/WSS Port

### Supported deployment shape

```text
                         public :443
                              |
                    TLS reverse proxy
                     /               \
        ordinary HTTP requests      Upgrade: websocket
                   |                         |
        127.0.0.1:<hono-port>      127.0.0.1:<libp2p-port>
             Hono web/API          @libp2p/websockets
```

This can use the same hostname and `/` path because Hono does not need a public WebSocket endpoint in the proposed scope. The proxy discriminates on the HTTP Upgrade request. If Hono later gains WebSocket features, reserve a distinct hostname for libp2p on the same `443`, or first verify path support across the exact libp2p/multiaddr dependency set.

NGINX documents that `Upgrade` and `Connection` are hop-by-hop headers and must be forwarded explicitly for a WebSocket tunnel; it also defaults idle proxied WebSockets to a 60-second read timeout ([NGINX WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)). Production configuration must therefore forward both headers and set an idle timeout compatible with libp2p/Yamux keepalive behavior.

### Why not attach libp2p directly to Hono's listener

- `@hono/node-server` turns Hono's `fetch` callback into a Node request listener, creates a server, and calls `listen`; its public factory can also configure a `ws` server in `noServer` mode ([Hono Node server source](https://github.com/honojs/node-server/blob/main/src/server.ts)).
- The libp2p WebSocket transport's public `WebSocketsInit` exposes HTTP(S) server **options**, buffer thresholds, and polling interval, but no existing `http.Server` ([transport source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/src/index.ts)).
- Its listener creates a private `net.Server`, creates its own HTTP/HTTPS server on `listen`, attaches its own Upgrade handler, and responds `400` to ordinary HTTP requests ([listener source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/src/listener.ts)). The package exports only its root and filters, not the listener internals ([package manifest](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/package.json)).

Consequently, sharing a Node server would require a new custom transport/listener or reliance on private internals. Neither is justified when one external port, rather than one internal socket, is the requirement.

The WebSocket spec permits an `http-path` component ([libp2p WebSockets specification](https://github.com/libp2p/specs/blob/master/websockets/README.md)), and `multiaddr-to-uri` can convert it to a URL path ([converter source](https://github.com/multiformats/js-multiaddr-to-uri/blob/master/src/index.ts)). However, the `@multiformats/multiaddr-matcher` WebSocket exact matcher used by the current transport does not include `http-path` in its WebSocket pattern ([matcher source](https://github.com/multiformats/js-multiaddr-matcher/blob/main/src/index.ts)). Do not make path routing a launch dependency without an integration test against the locked versions.

The repository currently resolves `@libp2p/interface` 3.2.5. `@libp2p/websockets` 10.1.19 declares `@libp2p/interface ^3.2.5`, while 10.1.20 has moved to `^3.3.0` ([10.1.19 registry metadata](https://registry.npmjs.org/@libp2p/websockets/10.1.19), [10.1.20 manifest](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/package.json)). Implementation should either pin the compatible release or update the libp2p family together and re-run all transport tests; allowing an unreviewed mixed-version resolution is avoidable risk.

## V2 Wire and Resource Limits

Use the route `/memorilo/sync/1` for the new contract. Because there is no prior release to distinguish, do not add a separate semantic discriminator. The first decoded message should declare peer role, a credential reference/proof, supported modes/domains, generation, and a client nonce. The server response either returns a derived session context/capabilities and server nonce, or a stable rejection code such as `unsupported-protocol`, `mode-disabled`, `credential-revoked`, `generation-mismatch`, or `rate-limited`.

After authentication, route every repository call through the derived `AuthenticatedSyncPeer`. Relay and authoritative behavior should implement the same bounded session port but are different policies. In particular, relay acknowledgements cannot imply durable recovery; they can only mean accepted for best-effort delivery to devices online in the current server lifetime.

Recommended initial limits, all configurable downward but not upward without a protocol/security review:

| Limit | Initial value | Enforcement point |
| --- | ---: | --- |
| Framed control/change message | 1 MiB | Read four-byte header, reject before reading body; writer rejects before allocation. |
| Changes per batch | 256 | Strict message schema and session state machine. |
| Total decoded string/payload bytes per batch | 768 KiB | Post-schema domain validation before repository access. |
| Sync streams per peer connection | 4 inbound / 4 outbound | `node.handle(..., { maxInboundStreams, maxOutboundStreams })`. |
| Pairing streams per peer connection | 2 inbound / 2 outbound | Pairing handler options. |
| Session inactivity | 30 seconds | Yamux stream option plus an application/session deadline. |
| Full session deadline | 2 minutes | Effect timeout/AbortSignal, renewed only by protocol progress if later required. |
| Concurrent authenticated sessions | Global and per-account configurable caps | Admission service before repository work. |

Attachments must not be embedded in these frames. The sync protocol exchanges asset manifests/content hashes; bytes use the separately authenticated object-transfer path and its own streaming limits.

The public libp2p handler API defaults to 32 inbound and 64 outbound streams per protocol and allows explicit per-handler limits ([stream handler interface](https://github.com/libp2p/js-libp2p/blob/main/packages/interface/src/stream-handler.ts), [registrar source](https://github.com/libp2p/js-libp2p/blob/main/packages/libp2p/src/registrar.ts)). Yamux itself defaults much higher and has a 4 MiB read buffer and unbounded write buffer, so application limits cannot be delegated to mux defaults ([Yamux config](https://github.com/ChainSafe/js-libp2p-yamux/blob/master/src/config.ts)). Its protocol includes per-stream flow control but explicitly requires bounded handling of unacknowledged streams to mitigate memory exhaustion ([Yamux specification](https://github.com/libp2p/specs/blob/master/yamux/README.md)).

The public libp2p stream API returns `false` from `send` under backpressure and exposes `onDrain`; it also exposes runtime read/write buffer lengths and limits ([message stream interface](https://github.com/libp2p/js-libp2p/blob/main/packages/interface/src/message-stream.ts)). The extracted writer must serialize writes per stream, stop calling `send` after `false`, await `onDrain` with the session abort signal, and set finite `maxWriteBufferLength`. The WebSocket transport separately defaults its socket `bufferedAmount` threshold to 4 MiB, applies write backpressure above it, and does not support transport-level read backpressure ([WebSocket transport source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/src/websocket-to-conn.ts)). This makes the application frame/session caps mandatory.

## Test Method

No test code was added during this research. The implementation should use the following layers so failures identify the owning boundary.

### Protocol unit and state-machine tests

- Strict-decode every union branch; reject missing, wrong-type, excess, unsafe-integer, invalid enum, and over-count fields.
- Exercise headers and payloads at `0`, exact maximum, and maximum plus one byte.
- Feed a frame byte-by-byte, in coalesced multiple-frame chunks, with an incomplete EOF, a huge declared length with no body, and a huge first chunk. Assert retained memory never exceeds the configured cap.
- Verify the writer stops after `send` returns false, waits for drain, honors cancellation, and never reorders concurrent writes.
- Drive initiator and responder through a deterministic in-memory duplex. Assert invalid message order, replayed nonce/session, role mismatch, generation mismatch, and timeout produce stable typed failures.
- Assert an authentication failure performs zero tenant-repository calls and an authenticated context cannot access a different account partition.

### Node integration tests

- Start two real libp2p nodes with TCP/mDNS-equivalent explicit addresses and prove direct `/memorilo/sync/1` sync.
- Add WebSocket transport to the desktop node, start a WebSocket-only server node, dial its complete multiaddr, and assert Noise identity, Yamux, handler limits, strict protocol negotiation, and a completed session.
- Run direct and server connections concurrently; stop the server and prove direct P2P still syncs; restart it and prove bounded reconnect resumes without duplicate application.
- Use two devices on one account and one on another to verify the server connection registry and authentication partition. For relay, disconnect a recipient before send and assert the server does not later recover/deliver that batch.

Do not use mDNS discovery in deterministic integration tests; explicit listen multiaddrs make failures attributable to transport/session behavior rather than multicast availability.

### One-port deployment test

Start the actual Hono Node adapter, actual libp2p WebSocket listener, and the supported reverse-proxy configuration on random loopback ports with a generated test CA. Through one external TLS port:

1. request `/health` and a built web asset over HTTPS;
2. dial the advertised WSS multiaddr and complete Noise/Yamux/`/memorilo/sync/1` sync;
3. attempt ordinary HTTP, malformed Upgrade, and idle WebSocket cases;
4. assert Hono never receives libp2p bytes and libp2p never receives ordinary HTTP;
5. verify the proxy idle timeout exceeds keepalive/session requirements.

Run this as a production-topology integration test, not a mock of Upgrade headers. A separate smoke test should run the packaged container/process with the same proxy configuration used by deployment.

### Lifecycle, load, and failure tests

- During active Hono and sync operations, trigger SIGTERM: readiness becomes false, new sessions are rejected, admitted work drains, and the process exits before the grace deadline.
- Hold a peer that never completes framing/authentication and prove shutdown aborts it at the deadline.
- Saturate per-peer streams, global sessions, frame input, and WebSocket write buffers; assert bounded memory and stable `rate-limited`/reset behavior.
- Inject repository failure, object-store failure, dropped connections, restart between receive and acknowledgement, and repeated batches. Assert idempotency and mode-specific acknowledgement semantics.
- Record metrics for rejected frames/authentication, active sessions by mode, drain duration, reconnect state, and bytes accepted/delivered; tests should assert cardinality excludes raw account, device, or PeerId labels.

## Implementation Sequence

1. Extract and harden the `/memorilo/sync/1` schemas, frame codec, errors, session state machine, and in-memory contract tests.
2. Refactor desktop P2P into the configurable node factory plus direct-device adapter; verify existing direct behavior on the new contract.
3. Add the desktop configured-server scheduler and WebSocket transport; verify coexistence before server persistence is introduced.
4. Build the Sync Server libp2p adapter with authentication/session admission and in-memory relay policy.
5. Add authoritative repository/object-store Layers and the Hono web/API composition.
6. Add the supported reverse-proxy deployment and one-port production-topology tests.
7. Add graceful shutdown, load/resource-limit, and failure-injection gates before declaring the public server deployable.

This ordering leaves each stage with one authoritative protocol implementation and avoids building server behavior on the current paired-device-specific session.
