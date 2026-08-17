# Memorilo SQLite Vec iOS module

This local Expo module embeds the `sqlite-vec` iOS framework that is absent from the Expo SDK 57 `expo-sqlite` npm package. The framework is assembled from the official `sqlite-vec` v0.1.9 release artifacts by `scripts/prepare-mobile-sqlite-vec.mjs`; release checksums are pinned in that script.

The module does not expose application behaviour. It only makes the framework bundle available to Expo SQLite, whose standard `bundledExtensions['sqlite-vec']` registration path remains authoritative.
