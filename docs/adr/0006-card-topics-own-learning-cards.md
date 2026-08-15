# Let CardTopics own learnable Cards

RegularTopics keep Card authoring marks and nodes in their collaborative content, but they do not enter the learning queue and do not provide Card Preview. Each Basic, List, Set, Cloze group, continuous inline Highlight, or block Highlight instead creates a direct child CardTopic containing only that source fragment; only the Card projection owned by that CardTopic is previewed, queued, reviewed, and rated. This makes the editable learning object visible in the Note hierarchy and allows CardTopics to contain nested authoring sources without turning the original knowledge Topic into a scheduler-owned object.

A CardTopic starts linked to its source: source edits replace its content and its title, which is derived from the first 20 Unicode characters. Editing the CardTopic or deleting its source detaches it while retaining its content, Card identity, and learning history; an immediate edit-detach may be undone by resynchronizing, which deliberately overwrites the detached content from the source. Linked and detached CardTopics use distinct hierarchy icons so this ownership state remains visible.

This replaces direct RegularTopic-to-learning projection and the earlier interpretation of Highlight as display-only metadata. The main SQLite database remains at schema generation `1`; persistence details stay below the CardTopic domain boundary.
