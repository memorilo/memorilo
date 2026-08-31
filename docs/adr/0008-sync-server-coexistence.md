# Allow an optional Sync Server peer alongside direct P2P

Status: accepted

Memorilo keeps direct, explicitly paired device-to-device synchronization as a complete mode. An optional multi-tenant Sync Server may join the same transport-neutral `/memorilo/sync/1` contract as a server peer reached over WebSocket. The server is additive: configuring it must not disable TCP/mDNS direct P2P, and clients may use both paths concurrently.

The route name remains `/memorilo/sync/1`; this is a breaking replacement before the first release, not a compatibility promise for an older deployed contract. The first handshake is strictly decoded according to the new schema and declares peer role, credential proof, namespaces, capabilities, generation and nonce. No old cursor conversion or dual protocol implementation is required.

The merge model, device version vectors, membership epochs, Noise/Yamux authentication and separate Note/Learning domains from ADR 0007 remain authoritative. The server adds account-scoped policy, persistence and reset behavior without becoming a global collaboration coordinator.

Consequences: direct P2P regression must remain independent of server availability; server WebSocket transport and direct TCP/mDNS transport share protocol code but have separate runtime configuration and lifecycle. Public deployment may present one HTTPS/WSS port through a proxy, while Hono and libp2p listeners remain separate internally.
