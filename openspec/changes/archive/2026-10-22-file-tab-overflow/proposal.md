# Proposal

## Why

When many documents are open, the tab bar exposes a horizontal scrollbar and users must drag it to find hidden files. The current 10-tab cap also limits workflows that compare many files.

## What Changes

- Hide the tab bar's visible horizontal scrollbar and translate mouse wheel input over the tabs into horizontal scrolling.
- Add a dropdown listing all currently open documents; choosing an item activates and reveals that tab.
- Increase the per-window open-document limit to 20 and clearly prompt users to close files before opening another.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tabs`: Update tab navigation behavior and raise the per-window capacity from 10 to 20.

## Impact

Affected areas include document session capacity handling, the document tab component and its markup/styles, and the existing document-tabs specification. No dependency or persistence format changes are needed.
