/* eslint-disable no-restricted-globals */
/* eslint-disable no-alert */
/* global chrome spacesService */

/* spaces
 * Copyright (C) 2015 Dean Oemcke
 */

import { dbService } from './dbService.js';
import { spacesService } from './spacesService.js';

/** @typedef {import('./common.js').SessionPresence} SessionPresence */
/** @typedef {import('./common.js').Space} Space */

// eslint-disable-next-line no-unused-vars, no-var
let spacesPopupWindowId = false;
let spacesOpenWindowId = false;
const noop = () => {};
const debug = false;

async function rediscoverWindowIds() {
    spacesOpenWindowId = await rediscoverWindowByUrl('spacesOpenWindowId', 'spaces.html');
    spacesPopupWindowId = await rediscoverWindowByUrl('spacesPopupWindowId', 'popup.html');
}

async function rediscoverWindowByUrl(storageKey, htmlFilename) {
    // Try to restore from storage first
    const stored = await chrome.storage.local.get(storageKey);
    if (stored[storageKey]) {
        // Verify the window still exists
        try {
            const window = await chrome.windows.get(stored[storageKey]);
            if (window) {
                return stored[storageKey];
            }
        } catch (error) {
            // Window doesn't exist, remove from storage
            await chrome.storage.local.remove(storageKey);
        }
    }

    // If not in storage or window doesn't exist, search for window by URL
    const targetUrl = chrome.runtime.getURL(htmlFilename);
    const allWindows = await chrome.windows.getAll({populate: true});
    
    for (const window of allWindows) {
        for (const tab of window.tabs) {
            if (tab.url && tab.url.startsWith(targetUrl)) {
                await chrome.storage.local.set({[storageKey]: window.id});
                return window.id;
            }
        }
    }
    
    return false;
}

// runtime extension install listener
chrome.runtime.onInstalled.addListener(details => {
    console.log(`Extension installed: ${JSON.stringify(details)}`);

    if (details.reason === 'install') {
        // eslint-disable-next-line no-console
        console.log('This is a first install!');
        showSpacesOpenWindow();
    } else if (details.reason === 'update') {
        const thisVersion = chrome.runtime.getManifest().version;
        if (details.previousVersion !== thisVersion) {
            // eslint-disable-next-line no-console
            console.log(
                `Updated from ${details.previousVersion} to ${thisVersion}!`
            );
        }
    }

    chrome.contextMenus.create({
        id: 'spaces-add-link',
        title: 'Add link to space...',
        contexts: ['link'],
    });
});

// Handle Chrome startup - this is when window IDs get reassigned!
chrome.runtime.onStartup.addListener(async () => {
    await spacesService.clearWindowIdAssociations();
    await spacesService.initialiseSpaces();
    await rediscoverWindowIds();
});

// LISTENERS

// add listeners for session monitoring
chrome.tabs.onCreated.addListener(async (tab) => {
    // this call to checkInternalSpacesWindows actually returns false when it should return true
    // due to the event being called before the globalWindowIds get set. oh well, never mind.
    if (checkInternalSpacesWindows(tab.windowId, false)) return;
    // don't need this listener as the tabUpdated listener also fires when a new tab is created
    // spacesService.handleTabCreated(tab);
    updateSpacesWindow('tabs.onCreated');
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (checkInternalSpacesWindows(removeInfo.windowId, false)) return;
    spacesService.handleTabRemoved(tabId, removeInfo, () => {
        updateSpacesWindow('tabs.onRemoved');
    });
});

chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
    if (checkInternalSpacesWindows(moveInfo.windowId, false)) return;
    spacesService.handleTabMoved(tabId, moveInfo, () => {
        updateSpacesWindow('tabs.onMoved');
    });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (checkInternalSpacesWindows(tab.windowId, false)) return;

    spacesService.handleTabUpdated(tab, changeInfo, () => {
        updateSpacesWindow('tabs.onUpdated');
    });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    if (checkInternalSpacesWindows(windowId, true)) return;
    spacesService.handleWindowRemoved(windowId, true, () => {
        updateSpacesWindow('windows.onRemoved');
    });

    // if this was the last window open and the spaces window is stil open
    // then close the spaces window also so that chrome exits fully
    // NOTE: this is a workaround for an issue with the chrome 'restore previous session' option
    // if the spaces window is the only window open and you try to use it to open a space,
    // when that space loads, it also loads all the windows from the window that was last closed
    const windows = await chrome.windows.getAll({});
    if (windows.length === 1 && spacesOpenWindowId) {
        await chrome.windows.remove(spacesOpenWindowId);
        spacesOpenWindowId = false;
        await chrome.storage.local.remove('spacesOpenWindowId');
    }
});

// don't need this listener as the tabUpdated listener also fires when a new window is created
// chrome.windows.onCreated.addListener(function (window) {

//     if (checkInternalSpacesWindows(window.id, false)) return;
//     spacesService.handleWindowCreated(window);
// });

// add listeners for tab and window focus changes
// when a tab or window is changed, close the move tab popup if it is open
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    // Prevent a click in the popup on Ubunto or ChroneOS from closing the
    // popup prematurely.
    if (
        windowId === chrome.windows.WINDOW_ID_NONE ||
        windowId === spacesPopupWindowId
    ) {
        return;
    }

    if (!debug && spacesPopupWindowId) {
        if (spacesPopupWindowId) {
            await closePopupWindow();
        }
    }
    
    spacesService.handleWindowFocussed(windowId);
});

// add listeners for message requests from other extension pages (spaces.html & tab.html)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (debug) {
        // eslint-disable-next-line no-console
        console.log(`listener fired: ${JSON.stringify(request)}`);
    }

    // Ensure spacesService is initialized before processing any message
    spacesService.ensureInitialized().then(() => {
        const result = processMessage(request, sender, sendResponse);
        // If processMessage returns false, we need to handle that by not sending a response
        // But since we're in an async context, we can't change the outer return value
        // The key is that processMessage will call sendResponse() for true cases
        // and won't call it for false cases, which is the correct behavior
    });
    
    // We have to return true here because we're handling everything asynchronously
    // The actual response sending is controlled by whether processMessage calls sendResponse()
    return true;
});

function processMessage(request, sender, sendResponse) {
    let sessionId;
    let windowId;
    let tabId;

    // endpoints called by spaces.js
    switch (request.action) {
        case 'requestSessionPresence':
            const sessionPresence = requestSessionPresence(request.sessionName);
            sendResponse(sessionPresence);
            return true;

        case 'requestSpaceFromWindowId':
            windowId = _cleanParameter(request.windowId);
            if (windowId) {
                requestSpaceFromWindowId(windowId).then(space => {
                    sendResponse(space);
                });
            }
            return true;

        case 'requestCurrentSpace':
            requestCurrentSpace().then(space => {
                sendResponse(space);
            });
            return true;

        case 'generatePopupParams':
            generatePopupParams(request.action, request.tabUrl).then(params => {
                sendResponse(params);
            });
            return true;

        case 'loadSession':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId) {
                handleLoadSession(sessionId);
                sendResponse(true);
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);

            return true;

        case 'loadWindow':
            windowId = _cleanParameter(request.windowId);
            if (windowId) {
                handleLoadWindow(windowId);
                sendResponse(true);
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);

            return true;

        case 'loadTabInSession':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId && request.tabUrl) {
                handleLoadSession(sessionId, request.tabUrl);
                sendResponse(true);
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);

            return true;

        case 'loadTabInWindow':
            windowId = _cleanParameter(request.windowId);
            if (windowId && request.tabUrl) {
                handleLoadWindow(windowId, request.tabUrl);
                sendResponse(true);
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);

            return true;

        case 'saveNewSession':
            windowId = _cleanParameter(request.windowId);
            if (windowId && request.sessionName) {
                handleSaveNewSession(
                    windowId,
                    request.sessionName,
                    !!request.deleteOld,
                    sendResponse
                );
            }
            return true; // allow async response

        case 'importNewSession':
            if (request.urlList) {
                handleImportNewSession(request.urlList, sendResponse);
            }
            return true; // allow async response

        case 'restoreFromBackup':
            if (request.space) {
                handleRestoreFromBackup(request.space, !!request.deleteOld, sendResponse);
            }
            return true; // allow async response

        case 'deleteSession':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId) {
                handleDeleteSession(sessionId, sendResponse);
            }
            return true;

        case 'updateSessionName':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId && request.sessionName) {
                handleUpdateSessionName(
                    sessionId,
                    request.sessionName,
                    !!request.deleteOld,
                    sendResponse
                );
            }
            return true;

        case 'requestSpaceDetail':
            windowId = _cleanParameter(request.windowId);
            sessionId = _cleanParameter(request.sessionId);

            if (windowId) {
                if (checkInternalSpacesWindows(windowId, false)) {
                    sendResponse(false);
                } else {
                    requestSpaceFromWindowId(windowId).then(space => {
                        sendResponse(space);
                    });
                }
            } else if (sessionId) {
                requestSpaceFromSessionId(sessionId, sendResponse);
            }
            return true;

        // end points called by tag.js and switcher.js
        // note: some of these endpoints will close the requesting tab
        case 'requestAllSpaces':
            requestAllSpaces(allSpaces => {
                sendResponse(allSpaces);
            });
            return true;

        case 'requestTabDetail':
            tabId = _cleanParameter(request.tabId);
            if (tabId) {
                requestTabDetail(tabId).then(tab => {
                    if (tab) {
                        sendResponse(tab);
                    } else {
                        // close the requesting tab (should be tab.html)
                        closePopupWindow();
                    }
                });
            }
            return true;

        case 'requestShowSpaces':
            windowId = _cleanParameter(request.windowId);

            // show the spaces tab in edit mode for the passed in windowId
            if (windowId) {
                showSpacesOpenWindow(windowId, request.edit);
            } else {
                showSpacesOpenWindow();
            }
            return false;

        case 'requestShowSwitcher':
            showSpacesSwitchWindow();
            return false;

        case 'requestShowMover':
            showSpacesMoveWindow();
            return false;

        case 'requestShowKeyboardShortcuts':
            createShortcutsWindow();
            return false;

        case 'requestClose':
            // close the requesting tab (should be tab.html)
            closePopupWindow();
            return false;

        case 'switchToSpace':
            windowId = _cleanParameter(request.windowId);
            sessionId = _cleanParameter(request.sessionId);

            (async () => {
                if (windowId) {
                    await handleLoadWindow(windowId);
                } else if (sessionId) {
                    await handleLoadSession(sessionId);
                }
                sendResponse(true);
            })();

            return true;

        case 'addLinkToNewSession':
            tabId = _cleanParameter(request.tabId);
            if (request.sessionName && request.url) {
                handleAddLinkToNewSession(
                    request.url,
                    request.sessionName,
                    result => {
                        if (result)
                            updateSpacesWindow('addLinkToNewSession');

                        // close the requesting tab (should be tab.html)
                        closePopupWindow();
                    }
                );
            }
            return false;

        case 'moveTabToNewSession':
            tabId = _cleanParameter(request.tabId);
            if (request.sessionName && tabId) {
                handleMoveTabToNewSession(
                    tabId,
                    request.sessionName,
                    result => {
                        if (result)
                            updateSpacesWindow('moveTabToNewSession');

                        // close the requesting tab (should be tab.html)
                        closePopupWindow();
                    }
                );
            }
            return false;

        case 'addLinkToSession':
            sessionId = _cleanParameter(request.sessionId);

            if (sessionId && request.url) {
                handleAddLinkToSession(request.url, sessionId, result => {
                    if (result) updateSpacesWindow('addLinkToSession');

                    // close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;

        case 'moveTabToSession':
            sessionId = _cleanParameter(request.sessionId);
            tabId = _cleanParameter(request.tabId);

            if (sessionId && tabId) {
                handleMoveTabToSession(tabId, sessionId, result => {
                    if (result) updateSpacesWindow('moveTabToSession');

                    // close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;

        case 'addLinkToWindow':
            windowId = _cleanParameter(request.windowId);

            if (windowId && request.url) {
                handleAddLinkToWindow(request.url, windowId, result => {
                    if (result) updateSpacesWindow('addLinkToWindow');

                    // close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;

        case 'moveTabToWindow':
            windowId = _cleanParameter(request.windowId);
            tabId = _cleanParameter(request.tabId);

            if (windowId && tabId) {
                handleMoveTabToWindow(tabId, windowId, result => {
                    if (result) updateSpacesWindow('moveTabToWindow');

                    // close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;

        default:
            return false;
    }
}

function _cleanParameter(param) {
    if (typeof param === 'number') {
        return param;
    }
    if (param === 'false') {
        return false;
    }
    if (param === 'true') {
        return true;
    }
    return parseInt(param, 10);
}

// add listeners for keyboard commands

chrome.commands.onCommand.addListener(command => {
    // handle showing the move tab popup (tab.html)
    if (command === 'spaces-move') {
        showSpacesMoveWindow();

        // handle showing the switcher tab popup (switcher.html)
    } else if (command === 'spaces-switch') {
        showSpacesSwitchWindow();
    }
});

chrome.contextMenus.onClicked.addListener(info => {
    // handle showing the move tab popup (tab.html)
    if (info.menuItemId === 'spaces-add-link') {
        showSpacesMoveWindow(info.linkUrl);
    }
});

function createShortcutsWindow() {
    chrome.tabs.create({ url: 'chrome://extensions/configureCommands' });
}

async function showSpacesOpenWindow(windowId, editMode) {
    let url;

    if (editMode && windowId) {
        url = chrome.runtime.getURL(
            `spaces.html#windowId=${windowId}&editMode=true`
        );
    } else {
        url = chrome.runtime.getURL('spaces.html');
    }

    // if spaces open window already exists then just give it focus (should be up to date)
    if (spacesOpenWindowId) {
        const window = await chrome.windows.get(spacesOpenWindowId, { populate: true });
        await chrome.windows.update(spacesOpenWindowId, {
            focused: true,
        });
        if (window.tabs[0].id) {
            await chrome.tabs.update(window.tabs[0].id, { url });
        }

        // otherwise re-create it
    } else {
        // TODO(codedread): Handle multiple displays and errors.
        const displays = await chrome.system.display.getInfo();
        let screen = displays[0].bounds;
        const window = await chrome.windows.create(
            {
                type: 'popup',
                url,
                height: screen.height - 100,
                width: Math.min(screen.width, 1000),
                top: 0,
                left: 0,
            });
        spacesOpenWindowId = window.id;
        await chrome.storage.local.set({spacesOpenWindowId: window.id});
    }
}

function showSpacesMoveWindow(tabUrl) {
    createOrShowSpacesPopupWindow('move', tabUrl);
}

function showSpacesSwitchWindow() {
    createOrShowSpacesPopupWindow('switch');
}

async function generatePopupParams(action, tabUrl) {
    // get currently highlighted tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return '';

    const activeTab = tabs[0];

    // make sure that the active tab is not from an internal spaces window
    if (checkInternalSpacesWindows(activeTab.windowId, false)) {
        return '';
    }

    const session = await dbService.fetchSessionByWindowId(activeTab.windowId);

    const name = session ? session.name : '';

    let params = `action=${action}&windowId=${activeTab.windowId}&sessionName=${name}`;

    if (tabUrl) {
        params += `&url=${encodeURIComponent(tabUrl)}`;
    } else {
        params += `&tabId=${activeTab.id}`;
    }
    return params;
}

async function createOrShowSpacesPopupWindow(action, tabUrl) {
    const params = await generatePopupParams(action, tabUrl);
    const popupUrl = `${chrome.runtime.getURL(
        'popup.html'
    )}#opener=bg&${params}`;
    // if spaces  window already exists
    if (spacesPopupWindowId) {
        const window = await chrome.windows.get(
            spacesPopupWindowId,
            { populate: true }
        );
        // if window is currently focused then don't update
        if (window.focused) {
            // else update popupUrl and give it focus
        } else {
            await chrome.windows.update(spacesPopupWindowId, {
                focused: true,
            });
            if (window.tabs[0].id) {
                await chrome.tabs.update(window.tabs[0].id, {
                    url: popupUrl,
                });
            }
        }

        // otherwise create it
    } else {
        // TODO(codedread): Handle multiple displays and errors.
        const displays = await chrome.system.display.getInfo();
        let screen = displays[0].bounds;

        const window = await chrome.windows.create(
            {
                type: 'popup',
                url: popupUrl,
                focused: true,
                height: 450,
                width: 310,
                top: screen.height - 450,
                left: screen.width - 310,
            });
        spacesPopupWindowId = window.id;
        await chrome.storage.local.set({spacesPopupWindowId: window.id});
    }
}

async function closePopupWindow() {
    if (spacesPopupWindowId) {
        try {
            const spacesWindow = await chrome.windows.get(
                spacesPopupWindowId,
                { populate: true }
            );
            if (!spacesWindow) return;

            // remove popup from history
            if (
                spacesWindow.tabs.length > 0 &&
                spacesWindow.tabs[0].url
            ) {
                await chrome.history.deleteUrl({
                    url: spacesWindow.tabs[0].url,
                });
            }

            // remove popup window
            await chrome.windows.remove(spacesWindow.id);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(e.message);
        }
    }
}

async function updateSpacesWindow(source) {
    if (debug) {
        // eslint-disable-next-line no-console
        console.log(`updateSpacesWindow: triggered. source: ${source}`);
    }

    // If we don't have a cached spacesOpenWindowId, try to find the spaces window
    if (!spacesOpenWindowId) {
        await rediscoverWindowIds();
    }

    if (spacesOpenWindowId) {
        const spacesOpenWindow = await chrome.windows.get(spacesOpenWindowId);
        if (chrome.runtime.lastError || !spacesOpenWindow) {
            // eslint-disable-next-line no-console
            console.log(`updateSpacesWindow: Error getting spacesOpenWindow: ${chrome.runtime.lastError}`);
            spacesOpenWindowId = false;
            await chrome.storage.local.remove('spacesOpenWindowId');
            return;
        }

        requestAllSpaces(allSpaces => {
            try {
                chrome.runtime.sendMessage({
                    action: 'updateSpaces',
                    spaces: allSpaces,
                });
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error(`updateSpacesWindow: Error updating spaces window: ${err}`);
            }
        });
    }
}

function checkInternalSpacesWindows(windowId, windowClosed) {
    if (windowId === spacesOpenWindowId) {
        if (windowClosed) {
            spacesOpenWindowId = false;
            chrome.storage.local.remove('spacesOpenWindowId');
        }
        return true;
    }
    if (windowId === spacesPopupWindowId) {
        if (windowClosed) {
            spacesPopupWindowId = false;
            chrome.storage.local.remove('spacesPopupWindowId');
        }
        return true;
    }
    return false;
}

/**
 * @param {string} sessionName
 * @returns {SessionPresence}
 */
async function requestSessionPresence(sessionName) {
    const session = await dbService.fetchSessionByName(sessionName);
    return { exists: !!session, isOpen: !!session && !!session.windowId };
}

/**
 * @param {number} tabId - The ID of the tab to retrieve details for
 * @returns {Promise<chrome.tabs.Tab|null>} A Promise that resolves to the tab object or null.
 */
async function requestTabDetail(tabId) {
    try {
        return await chrome.tabs.get(tabId);
    } catch (error) {
        return null;
    }
}

/**
 * Requests the current space based on the current window.
 * @returns {Promise<Space|false>}
 */
async function requestCurrentSpace() {
    const window = await chrome.windows.getCurrent();
    return await requestSpaceFromWindowId(window.id);
}

/**
 * @param {number} windowId
 * @returns {Promise<Space|false>}
 */
async function requestSpaceFromWindowId(windowId) {
    // first check for an existing session matching this windowId
    const session = await dbService.fetchSessionByWindowId(windowId);

    if (session) {
        /** @type {Space} */
        const space = {
            sessionId: session.id,
            windowId: session.windowId,
            name: session.name,
            tabs: session.tabs,
            history: session.history,
        };
        return space;

    // otherwise build a space object out of the actual window
    } else {
        try {
            const window = await chrome.windows.get(windowId, { populate: true });
            /** @type {Space} */
            const space = {
                sessionId: false,
                windowId: window.id,
                name: false,
                tabs: window.tabs,
                history: false,
            };
            return space;
        } catch (e) {
            return false;
        }
    }
}

async function requestSpaceFromSessionId(sessionId, callback) {
    const session = await dbService.fetchSessionById(sessionId);

    callback({
        sessionId: session.id,
        windowId: session.windowId,
        name: session.name,
        tabs: session.tabs,
        history: session.history,
    });
}

async function requestAllSpaces(callback) {
    const sessions = await dbService.fetchAllSessions();
    const allSpaces = sessions
        .map(session => {
            return { sessionId: session.id, ...session };
        })
        .filter(session => {
            return session && session.tabs && session.tabs.length > 0;
        });

    // sort results
    allSpaces.sort(spaceDateCompare);

    callback(allSpaces);
}

function spaceDateCompare(a, b) {
    // order open sessions first
    if (a.windowId && !b.windowId) {
        return -1;
    }
    if (!a.windowId && b.windowId) {
        return 1;
    }
    // then order by last access date
    if (a.lastAccess > b.lastAccess) {
        return -1;
    }
    if (a.lastAccess < b.lastAccess) {
        return 1;
    }
    return 0;
}

    async function handleLoadSession(sessionId, tabUrl) {
    const session = await dbService.fetchSessionById(sessionId);

    // if space is already open, then give it focus
    if (session.windowId) {
        await handleLoadWindow(session.windowId, tabUrl);

        // else load space in new window
    } else {
        const urls = session.tabs.map(curTab => {
            return curTab.url;
        });

        // TODO(codedread): Handle multiple displays and errors.
        const displays = await chrome.system.display.getInfo();
        let screen = displays[0].bounds;

        const newWindow = await chrome.windows.create(
            {
                url: urls,
                height: screen.height - 100,
                width: screen.width - 100,
                top: 0,
                left: 0,
            });

        // force match this new window to the session
        spacesService.matchSessionToWindow(session, newWindow);

        // after window has loaded try to pin any previously pinned tabs
        for (const curSessionTab of session.tabs) {
            if (curSessionTab.pinned) {
                let pinnedTabId = false;
                newWindow.tabs.some(curNewTab => {
                    if (
                        curNewTab.url === curSessionTab.url ||
                        curNewTab.pendingUrl === curSessionTab.url
                    ) {
                        pinnedTabId = curNewTab.id;
                        return true;
                    }
                    return false;
                });
                if (pinnedTabId) {
                    await chrome.tabs.update(pinnedTabId, {
                        pinned: true,
                    });
                }
            }
        }

        // if tabUrl is defined, then focus this tab
        if (tabUrl) {
            await focusOrLoadTabInWindow(newWindow, tabUrl);
        }

                /* session.tabs.forEach(function (curTab) {
                chrome.tabs.create({windowId: newWindow.id, url: curTab.url, pinned: curTab.pinned, active: false});
            });

            const tabs = await chrome.tabs.query({windowId: newWindow.id, index: 0});
            chrome.tabs.remove(tabs[0].id); */
    }
}

async function handleLoadWindow(windowId, tabUrl) {
    // assume window is already open, give it focus
    if (windowId) {
        await focusWindow(windowId);
    }

    // if tabUrl is defined, then focus this tab
    if (tabUrl) {
        const theWin = await chrome.windows.get(windowId, { populate: true });
        await focusOrLoadTabInWindow(theWin, tabUrl);
    }
}

async function focusWindow(windowId) {
    await chrome.windows.update(windowId, { focused: true });
}

async function focusOrLoadTabInWindow(window, tabUrl) {
    let match = false;
    for (const tab of window.tabs) {
        if (tab.url === tabUrl) {
            await chrome.tabs.update(tab.id, { active: true });
            match = true;
            break;
        }
    }

    if (!match) {
        await chrome.tabs.create({ url: tabUrl });
    }
}

async function handleSaveNewSession(windowId, sessionName, deleteOld, callback) {
    const curWindow = await chrome.windows.get(windowId, { populate: true });
    const existingSession = await dbService.fetchSessionByName(sessionName);

    // if session with same name already exist, then prompt to override the existing session
    if (existingSession) {
        if (!deleteOld) {
            console.error(
                `handleSaveNewSession: Session with name "${sessionName}" already exists and deleteOld was not true.`
            );
            callback(false);
            return;

            // if we choose to overwrite, delete the existing session
        }
        handleDeleteSession(existingSession.id, noop);
    }
    spacesService.saveNewSession(
        sessionName,
        curWindow.tabs,
        curWindow.id,
        callback
    );
}

async function handleRestoreFromBackup(space, deleteOld, callback) {
    const existingSession = space.name
        ? await dbService.fetchSessionByName(space.name)
        : false;

    // if session with same name already exist, then prompt to override the existing session
    if (existingSession) {
        if (!deleteOld) {
            console.error(
                `handleRestoreFromBackup: Session with name "${space.name}" already exists and deleteOld was not true.`
            );
            callback(false);
            return;

                // if we choose to overwrite, delete the existing session
        }
        handleDeleteSession(existingSession.id, noop);
    }

    spacesService.saveNewSession(
        space.name,
        space.tabs,
        false,
        callback
    );
}

async function handleImportNewSession(urlList, callback) {
    let tempName = 'Imported space: ';
    let count = 1;

    while (await dbService.fetchSessionByName(tempName + count)) {
        count += 1;
    }

    tempName += count;

    const tabList = urlList.map(text => {
        return { url: text };
    });

    // save session to database
    spacesService.saveNewSession(tempName, tabList, false, callback);
}

async function handleUpdateSessionName(sessionId, sessionName, deleteOld, callback) {
    // check to make sure session name doesn't already exist
    const existingSession = await dbService.fetchSessionByName(sessionName);

    // if session with same name already exist, then prompt to override the existing session
    if (existingSession) {
        if (!deleteOld) {
            console.error(
                `handleUpdateSessionName: Session with name "${sessionName}" already exists and deleteOld was not true.`
            );
            callback(false);
            return;

            // if we choose to override, then delete the existing session
        }
        handleDeleteSession(existingSession.id, noop);
    }
    spacesService.updateSessionName(sessionId, sessionName, callback);
}

async function handleDeleteSession(sessionId, callback) {
    const session = await dbService.fetchSessionById(sessionId);
    if (!session) {
        console.error(`handleDeleteSession: No session found with id ${sessionId}`);
        callback(false);
        return;
    }

    spacesService.deleteSession(sessionId, callback);
}

async function handleAddLinkToNewSession(url, sessionName, callback) {
    const session = await dbService.fetchSessionByName(sessionName);
    const newTabs = [{ url }];

    // if we found a session matching this name then return as an error as we are
    // supposed to be creating a new session with this name
    if (session) {
        callback(false);

        // else create a new session with this name containing this url
    } else {
        spacesService.saveNewSession(sessionName, newTabs, false, callback);
    }
}

async function handleMoveTabToNewSession(tabId, sessionName, callback) {
    const tab = await requestTabDetail(tabId);
    if (!tab) {
        callback(false);
        return;
    }

    const session = await dbService.fetchSessionByName(sessionName);

    // if we found a session matching this name then return as an error as we are
    // supposed to be creating a new session with this name
    if (session) {
        callback(false);

        //  else create a new session with this name containing this tab
    } else {
        // remove tab from current window (should generate window events)
        chrome.tabs.remove(tab.id);

        // save session to database
        spacesService.saveNewSession(
            sessionName,
            [tab],
            false,
            callback
        );
    }
}

async function handleAddLinkToSession(url, sessionId, callback) {
    const session = await dbService.fetchSessionById(sessionId);
    const newTabs = [{ url }];

    // if we have not found a session matching this name then return as an error as we are
    // supposed to be adding the tab to an existing session
    if (!session) {
        callback(false);
        return;
    }
    // if session is currently open then add link directly
    if (session.windowId) {
        handleAddLinkToWindow(url, session.windowId, callback);

        // else add tab to saved session in database
    } else {
        // update session in db
        session.tabs = session.tabs.concat(newTabs);
        spacesService.updateSessionTabs(session.id, session.tabs, callback);
    }
}

function handleAddLinkToWindow(url, windowId, callback) {
    chrome.tabs.create({ windowId, url, active: false });

    // NOTE: this move does not seem to trigger any tab event listeners
    // so we need to update sessions manually
    spacesService.queueWindowEvent(windowId);

    callback(true);
}

async function handleMoveTabToSession(tabId, sessionId, callback) {
    const tab = await requestTabDetail(tabId);
    if (!tab) {
        callback(false);
        return;
    }

    const session = await dbService.fetchSessionById(sessionId);
    const newTabs = [tab];

    // if we have not found a session matching this name then return as an error as we are
    // supposed to be adding the tab to an existing session
    if (!session) {
        callback(false);
    } else {
        // if session is currently open then move it directly
        if (session.windowId) {
            moveTabToWindow(tab, session.windowId, callback);
            return;
        }

        // else add tab to saved session in database
        // remove tab from current window
        chrome.tabs.remove(tab.id);

        // update session in db
        session.tabs = session.tabs.concat(newTabs);
        spacesService.updateSessionTabs(
            session.id,
            session.tabs,
            callback
        );
    }
}

async function handleMoveTabToWindow(tabId, windowId, callback) {
    const tab = await requestTabDetail(tabId);
    if (!tab) {
        callback(false);
        return;
    }
    moveTabToWindow(tab, windowId, callback);
}

function moveTabToWindow(tab, windowId, callback) {
    chrome.tabs.move(tab.id, { windowId, index: -1 });

    // NOTE: this move does not seem to trigger any tab event listeners
    // so we need to update sessions manually
    spacesService.queueWindowEvent(tab.windowId);
    spacesService.queueWindowEvent(windowId);

    callback(true);
}

console.log(`Initializing spacesService...`);
spacesService.initialiseSpaces();
