# Bind each BookTopic to one concrete file

A BookTopic is a Topic subtype inside the owning Note's LoroDoc and binds one BookFile identified by format and SHA-256, rather than binding a catalog Publication or living in a separate registry. Publication and Shelf rendition identifiers remain retrieval hints, while editable Topic content, reading position, and annotations stay in the Note aggregate; this permits the same Publication's different formats to have independent contexts and preserves a BookTopic when its catalog source disappears.
