# Design

## Context

The document session coordinator already owns the per-window capacity check and emits a toast when it refuses a new tab. The tab strip is a flex row with an independently scrollable tab container.

## Goals / Non-Goals

**Goals:** Keep capacity enforcement in the coordinator; expose the same live session list through a compact menu; make wheel navigation work without a visible scrollbar.

**Non-Goals:** Persisting open tabs across restarts, changing session lifecycle behavior, or adding another document-list data source.

## Decisions

- Export the 20-tab limit from the session coordinator and use it both for admission checks and the disabled new-tab affordance, avoiding duplicated constants.
- Render dropdown entries from `getDocumentTabs()` on each session notification, so labels, dirty markers, and active state stay in sync.
- Translate the dominant wheel axis into `scrollLeft` on the tab viewport. The menu delegates activation to the existing session API, then reveals the associated tab.
- Keep the menu and tab viewport in the existing tab-bar component and style the menu as an anchored overlay, so it does not consume editor space.

## Risks / Trade-offs

- [Wheel input may be horizontal already on some devices] → Use the larger of `deltaX` and `deltaY` so trackpad horizontal gestures continue to work.
- [The dropdown could become stale after close or rename operations] → Re-render from the session change subscription, the same source used by the tabs.
