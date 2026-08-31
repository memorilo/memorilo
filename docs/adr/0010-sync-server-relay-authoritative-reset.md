# Define account-level Relay and Authoritative Sync Server modes

Status: accepted

An account selects Relay or Authoritative policy. Relay forwards encrypted sync traffic only between currently connected devices, persists no transferred payload and cannot provide offline recovery. Authoritative stores plaintext Note, Personal Learning Sync and asset data as a durable peer and recovery source. The management UI must state this distinction explicitly.

Mode changes are explicit, step-up-protected operations. Switching away from Authoritative requires the user to choose whether existing server-held data is retained or cleared; no silent deletion occurs. Authoritative data clearing is separate from account deletion, leaves account/device membership intact, advances the account Sync Generation and runs a restartable deletion job. The UI requires typed `CLEAR SERVER DATA` and explains that the server cannot recover cleared data while devices are offline.

Policy and generation gates reject late writes from disabled modes or old generations. Relay acknowledgements mean online forwarding only; Authoritative acknowledgements require durable persistence before acknowledgement.
