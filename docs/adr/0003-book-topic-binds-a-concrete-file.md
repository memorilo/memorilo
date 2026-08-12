# Bind each BookTopic to one concrete file

A BookTopic is a Topic subtype inside the owning Note's LoroDoc and binds one BookFile identified by format and SHA-256, rather than binding a catalog Publication or living in a separate registry. Publication and Shelf rendition identifiers remain retrieval hints, while editable Topic content, reading position, and annotations stay in the Note aggregate; this permits the same Publication's different formats to have independent contexts and preserves a BookTopic when its catalog source disappears.

## Reading session ownership

The renderer owns each native reading session returned while selecting, creating, or rebinding a BookTopic context. Replacing an active context follows a persistence barrier:

1. Flush pending Note changes for the active reader before requesting the replacement context.
2. Acquire the replacement context and native session through the latest-operation supervisor.
3. Transfer active ownership to the accepted session and retire the previous native session.

The pre-acquisition flush ensures the main process builds the replacement context from an authoritative Note snapshot. Changes admitted while the replacement request is in flight remain owned by the renderer persistence queue. A replacement for the same Note imports those pending changes during hydration; changes for a different Note remain queued for their normal save. Retiring the previous native session must not clear that queue with a second flush. Final route or application cleanup still flushes all accepted Note changes before closing the active native session.

The main process runs create, select, and rebind as one operation in the same per-reading lane used by Shelf deletion. The operation atomically retains the file in the library, commits or reads the BookTopic context, and registers the renderer-owned session before releasing the lane. A concurrent deletion therefore observes the new session and cannot remove its file. If Note persistence fails after retention, the library copy remains an idempotent recovery point and the whole operation can be retried without downloading the publication again.

Superseded IPC responses do not transfer ownership. If such a response creates a distinct native session, the renderer closes it immediately. Session acquisition shutdown drains accepted requests, reclaims late sessions, rejects new admission, and retains failed cleanup ownership so a later close can retry.
