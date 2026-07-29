# Use LoroTree as the canonical Topic Block structure

Each Topic stores its ProseMirror document as one LoroTree with a single `doc` root. Every non-text ProseMirror node and every contiguous rich-text run occupies a tree node; text-run nodes own a LoroText that stores characters and marks. Parentage and sibling order exist only in LoroTree, and structural edits reconcile through native `LoroTree.move()` so moved Blocks retain their CRDT identity. ProseMirror is an editable projection of this tree rather than a second canonical hierarchy.

This representation makes Outline reparenting, ordering, synchronization, undo, and time travel share one movable structure. It adds an adapter that must translate selections and rich-text leaves between ProseMirror and Loro, but avoids the conflicting dual structure of a map/list ProseMirror encoding beside a separate outline tree.
