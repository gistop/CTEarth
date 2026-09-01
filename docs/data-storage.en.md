# Data Storage and Import Persistence

This document records how CTEarth handles vector imports, autosave, and local restore. It is a development note, not an end-user manual.

## Purpose

Uploaded vector layers are normalized to GeoJSON and stored in browser IndexedDB together with layer state such as style, visibility, order, selection, and the active layer.

The goal is to:

- restore the current workspace after reload
- continue the last editing session after reopening the browser
- preserve layer state, not just geometry

## Persistence Scope

The persisted vector draft includes:

- GeoJSON geometry and properties
- layer style
- layer visibility
- layer order
- active layer
- selected field
- selected features

The original uploaded source file is not stored as the primary persistent artifact in the project directory.

## Storage Location

Draft data is written to browser-local IndexedDB under the database name `ctearth-vector-drafts`.

On startup, the app reads the draft back from the same local store and restores the layer list.

## Related Implementation

- `src/gisStore.tsx`
