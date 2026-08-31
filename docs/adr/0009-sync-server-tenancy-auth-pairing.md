# Bind Sync Server state to single-user tenants and explicit device credentials

Status: accepted

Each Sync Server Account is one user's tenant. Notes, Personal Learning Sync data, assets, devices and credentials are account-scoped; accounts cannot read, write, list, acknowledge or delete one another's state. A local database may have at most one active server-account binding, while direct paired devices remain independent.

Browser management uses Argon2id password/passkey-capable sessions with cookies and CSRF protection. Sync streams use device-generated signing keys and scoped revocable credentials bound to account, DeviceId, PeerId and MembershipEpoch. Browser sessions and device credentials are different credential types and are never interchangeable, but both resolve through shared identity, policy, rate-limit, audit and authenticated-account context modules.

Registration is configured as disabled, invite-only or public. An empty installation exposes a localhost-only first-run setup wizard to create the initial account; this prevents invite-only deployments from deadlocking before an account can issue the first invitation. After setup, the configured registration policy applies normally. Pairing requires matching confirmation in the management page and client before issuing a versioned credential bundle containing the server identity and current account epochs. Revocation advances membership state and stops new work; destructive and policy-changing actions require step-up authentication.
