# Management Web Workflows

Type: prototype
Status: resolved
Blocked by: 04, 05, 06, 07

## Question

What should users see and confirm when registering or accepting an invite, pairing a device, selecting or switching sync mode, understanding Relay Sync Mode's lack of offline recovery, revoking a device, inspecting server usage/status, and clearing authoritative data?

Create a low-cost interactive management-flow prototype using public `@memorilo/ui` semantics and default `neubrutalism`; use it to decide copy, information hierarchy, confirmation strength, progress/error states, accessibility, responsive layout, and the precise distinction between clearing server data, deleting an account, and retaining local device data.

## Prototype for review

[Management Web Prototype](../prototypes/management-web/README.md) is a throwaway React/Vite page using public `@memorilo/ui`, the `neubrutalism` theme, in-memory state, and four layouts selected through `?variant=`:

- `A` — operations console with persistent account navigation;
- `B` — safety queue organized around pending confirmations and recovery impact;
- `C` — peer status board organized around live device topology and events;
- `D` — exploratory composite combining B's queue with A's navigation and C's peer strip (not selected).

All variants exercise invite registration, dual-confirmation pairing, Relay/Authoritative policy selection, the Relay no-offline-recovery warning, device revocation, authoritative storage inspection, and typed confirmation for clearing server-held data.

## Decision

Adopt variant **A — Operations console** as the management-web information architecture. It keeps persistent account navigation (Overview, Devices, Sync policy, Server data, Account) and uses the overview as the default landing page. The overview surfaces server health, authorized-device health, storage, last durable sync, and the current account mode, with direct actions for pairing and policy review.

The workflows and safety copy validated across the prototype remain part of the A implementation: dual-confirmation pairing, explicit Relay no-offline-recovery messaging, mode-switch confirmation with keep/clear handling for existing authoritative data, device revocation that does not delete local data, and typed confirmation (`CLEAR SERVER DATA`) for authoritative data clearing. Responsive behavior collapses the persistent navigation into a mobile header while retaining access to every section.
