# AGENTS.md — Context bootstrapper for the Spaces extension

This doc orients an AI coding agent (or a human) picking up work in this
repo. It's meant to be read once at the start of a session to get oriented,
regardless of which feature or bug is on deck. It intentionally avoids
describing any one in-flight feature — see git history / CHANGELOG.md /
open issues for "what's currently being worked on."

## What Spaces is

Spaces is a Manifest V3 Chrome extension that treats each Chrome window as a
named "space." Users can rename, close, reopen, and move tabs between spaces.
Closed spaces are persisted (via IndexedDB) so they can be reopened later
with all their tabs restored. See README.md for the user-facing pitch.

## Project layout

```
manifest.json           MV3 manifest. Background is a module service worker.
popup.html / js/popup.js        The toolbar popup (quick actions, switcher trigger).
spaces.html / js/spaces.js      The full-page "Spaces window" (options_page) — lists
                                 all spaces and lets you inspect/manage one in detail.
js/spacesRenderer.js     Shared rendering for the space *picker* list used by
                          popup.js/switcher.js — a different view from spaces.html.
js/switcher.js           Quick-switch-space popup (Ctrl+Shift+S).
js/common.js             Shared types (JSDoc typedefs: Space, Tab, Window) and small
                          helpers used by both UI pages and the background worker.
js/utils.js              Client-side-only helpers (escapeHtml, checkSessionOverwrite, etc).
js/background/main.js    Service worker entry point (just calls initializeServiceWorker()).
js/background/background.js   Message router (`processMessage`) + all the
                                chrome.tabs/chrome.windows orchestration logic.
js/background/spacesService.js  In-memory session/space model + tab/window event
                                  listeners that keep sessions in sync with live windows.
js/background/dbService.js / db.js   IndexedDB persistence layer.
css/style.css            Styles for spaces.html.
css/popup.css            Styles for popup.html.
tests/                    Flat directory of Jest tests, one file per unit under test,
                          named after the function (e.g. handleClose.test.js).
tests/helpers.js         Shared Jest mock setup (setupTestMocks, mockConsole, etc).
package.sh               Zips the extension for distribution (css/img/js/manifest/html).
CHANGELOG.md             Manually maintained, keyed by version + GitHub issue links.
```

## Core architecture: UI pages never touch chrome.* directly for mutations

All three UI surfaces (`popup.html`, `spaces.html`, the switcher) talk to the
background service worker exclusively via `chrome.runtime.sendMessage`. The
worker performs the actual `chrome.tabs`/`chrome.windows`/DB work and returns
a result (or pushes an unsolicited update).

```js
// UI side (e.g. js/spaces.js)
async function performXyz(...) {
    return chrome.runtime.sendMessage({ action: 'someAction', ...params });
}
```

```js
// js/background/background.js — processMessage(request, sender)
switch (request.action) {
    case 'someAction':
        // validate params, usually via cleanParameter()
        // do the chrome.* or spacesService/dbService work
        return result;
    ...
}
```

When background state changes in a way that should refresh an open
`spaces.html`, the worker calls `updateSpacesWindow(...)`, which messages the
page with `{ action: 'updateSpaces', spaces }`; the page's
`chrome.runtime.onMessage` listener (`js/spaces.js`) routes that to
`handleAutoUpdateRequest`. Any new action that mutates state should consider
whether it needs to trigger this refresh path.

**When adding a new mutation**, `case 'closeWindow'` (background.js ~365) and
its UI counterpart `handleClose` (js/spaces.js ~389, with its test
`tests/handleClose.test.js`) are a good end-to-end template: confirm (if
destructive/unnamed), send message, await result, refresh UI, and it's
written with injectable dependencies for testability.

## Data model (from `js/common.js`)

```js
/** @typedef Tab
 * @property {string} favIconUrl
 * @property {string} title
 * @property {string} url
 * (for an open window's tabs, this also carries a live chrome.tabs.Tab `id`)
 */

/** @typedef Space
 * @property {number|false} sessionId  // false if never saved
 * @property {number|false} windowId   // false if not currently open
 * @property {string|false} name
 * @property {Array<Tab>} tabs
 * @property {Array<Object>|false} history
 */
```

Important nuance: a `Space`'s `tabs` array is **not always backed by live
Chrome tabs**. For an open window, `spacesService` keeps `session.tabs` in
sync with `chrome.windows.get(windowId, {populate:true})`, so those tab
objects carry a live `id` usable with `chrome.tabs.*`. For a closed/saved
space, `session.tabs` comes straight from IndexedDB and has **no live
`id`** — there's no real tab to act on, only a saved record. Any feature that
wants to act on "a tab in a space" needs to know which of these two cases
it's in, since the implementation path differs (chrome.tabs API vs.
editing the saved session via spacesService/dbService and persisting it).

## The Spaces window detail view (spaces.html)

Two-pane layout:
- Left nav (`#openSpaces` / `#closedSpaces`): all spaces, via
  `renderSpacesList` (js/spaces.js).
- Right pane: detail for `globalSelectedSpace`, via `renderSpaceDetail` →
  `renderTabs` → `renderTabListEl`. Two lists: `#activeTabs` (`space.tabs`)
  and `#historicalTabs` (`space.history`), both `<ul class="tabsList">` of
  `<li>` containing a favicon `<img>` + an `<a>` (click → `handleLoadTab`).

This is the natural place to add any new per-tab or per-space UI (buttons,
badges, indicators) — `renderTabListEl` is where per-tab DOM is built, and
new interactive elements there follow the same "build DOM node, attach
listener that calls a `handleXyz` function which messages the background"
pattern as `handleLoadTab`/`handleClose`/`handleDelete`.

## Testing conventions

- Jest with ESM (`node --experimental-vm-modules`), `testEnvironment: node`.
- One test file per function under test, named exactly after it
  (`tests/<functionName>.test.js`), not per-source-file.
- `tests/helpers.js` provides `setupTestMocks()` / `setupChromeMocks()` /
  `setupDOMMocks()` / `mockConsole()` / `mockDbCreate` / `mockDbUpdate` — reuse
  these rather than hand-rolling new global mocks.
- Functions written to be testable take injectable dependencies as trailing
  optional params (see `handleClose(updateSpacesListFn, renderSpaceDetailFn)`)
  rather than reaching for module-level singletons in tests.
- `js/spaces.js` exports internal helpers/state explicitly at the bottom of
  the file purely for test access (`setGlobalSelectedSpace`,
  `getGlobalSelectedSpace`, `setNodesForTesting`) — follow this pattern for
  any new internal state tests need to reach.
- Run: `npm test`, `npm run test:watch`, `npm run test:coverage`. Coverage is
  collected from `js/**/*.js` excluding `*.test.js` and
  `js/background/main.js`; there's an active push to keep raising it
  (see CHANGELOG.md entries — coverage % is tracked per release).

## Conventions worth following

- No build step / bundler / TypeScript — plain ES modules loaded directly by
  the browser (`"type": "module"` in manifest.json and package.json).
- JSDoc typedefs (in `js/common.js`) stand in for a type system — keep them
  updated when `Space`/`Tab` shape changes.
- User-facing destructive actions (`handleClose`, `handleDelete`) use
  `window.confirm(...)`, generally skipped when the target is already a
  named/saved space (less to lose) and shown when it isn't.
- `escapeHtml` (js/utils.js) is used whenever untrusted strings (tab titles,
  space names) are injected via `innerHTML` — always route through it rather
  than interpolating raw strings into markup.
- CHANGELOG.md entries link to GitHub issues (`Fixed [issue #N](...)`) —
  when closing out a fix, follow that format.

## Before starting a new feature

1. Skim `js/background/background.js`'s `processMessage` switch to see if a
   similar action already exists (there's a lot of tab/window/session
   plumbing already built — moving tabs between sessions, adding links,
   restoring backups, etc.).
2. Check whether the change belongs in `js/spaces.js` (spaces.html detail
   view), `js/popup.js` (toolbar popup), or `js/switcher.js` (quick switch) —
   they share `common.js`/`utils.js` but have distinct rendering code.
3. Identify whether the feature needs to handle both "open space" (live
   `windowId`, real `chrome.tabs`) and "closed space" (saved session only,
   no live tabs) cases, per the data-model note above — this is a common
   source of scope ambiguity worth settling explicitly with the user before
   writing code.
4. Write/extend tests alongside the change using the existing per-function
   file convention, not as an afterthought.
