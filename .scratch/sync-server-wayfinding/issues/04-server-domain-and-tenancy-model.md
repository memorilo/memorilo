# Server Domain and Tenancy Model

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What are the canonical identities, aggregates, ownership boundaries, and lifecycle state machines for Account, User, Device, Sync Server, Sync Policy, Pairing Session, Device Credential, synchronization namespaces, reset generations, deletion jobs, and audit records?

Decide whether an Account is always one user or can contain multiple users/roles; how relay and authoritative policy is selected and switched; which metadata survives authoritative data clearing; how account suspension/deletion differs from clearing synchronized data; and which invariants every repository and protocol handler must enforce.

## Answer

The server domain decisions are:

1. `Account` is a single user's tenant boundary in the first implementation. Server operators are deployment-level administrators and are not users inside an Account. Organization accounts and multi-user roles are out of scope.
2. A local `Device` remains the source identity for sync mutations. An `Account Device` membership binds that device's `DeviceId` and libp2p `PeerId` to one Account, a revocable `DeviceCredential`, and a `MembershipEpoch`. Revoking the membership does not delete or rotate the local Device identity.
3. A local database may have one active Sync Server Account at a time, while retaining any number of direct Paired Devices. Multiple authoritative servers are not supported because they would create competing authorities, duplicate acknowledgements, and ambiguous reset semantics.
4. Accounts are hard tenant boundaries. Note content, Personal Learning Sync, assets, cursors, tombstones, reset generations, and deletion jobs never cross Account boundaries. Cross-account collaboration is out of scope for this effort.

The repository and protocol invariant is that every server operation receives an authenticated Account context derived from the credential and membership, never an arbitrary account id supplied by the caller. Account metadata and device membership may survive a content reset according to the later security/data-lifecycle decision; the reset must not silently become account deletion.
