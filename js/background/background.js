/* eslint-disable no-restricted-globals */
/* eslint-disable no-alert */
/* global chrome spacesService */

/* spaces
 * Copyright (C) 2015 Dean Oemcke
 * Copyright (C) 2025 Jeff Schiller (Codedread)
 */

import { dbService } from './dbService.js';
import { spacesService } from './spacesService.js';
import * as common from '../common.js';
/** @typedef {common.Space} Space */

// eslint-disable-next-line no-unused-vars, no-var
let spacesPopupWindowId = false;
let spacesOpenWindowId = false;
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

export function initializeServiceWorker() {
    console.log(`Initializing service worker...`);

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
        const wasProcessed = await spacesService.handleWindowRemoved(windowId, true);
        if (wasProcessed) {
            updateSpacesWindow('windows.onRemoved');
        }

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

    // Add listener for window creation to ensure new windows are detected
    chrome.windows.onCreated.addListener(function (window) {
        if (checkInternalSpacesWindows(window.id, false)) return;
        setTimeout(() => updateSpacesWindow('windows.onCreated'), 100);
    });

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

        // Handle async processing
        (async () => {
            try {
                // Ensure spacesService is initialized before processing any message
                await spacesService.ensureInitialized();
                
                const response = await processMessage(request, sender);
                if (response !== undefined) {
                    sendResponse(response);
                }
            } catch (error) {
                console.error('Error processing message:', error);
                sendResponse(false);
            }
        })();
        
        // We must return true synchronously to keep the message port open
        // for our async sendResponse() calls
        return true;
    });

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

    console.log(`Initializing spacesService...`);
    spacesService.initialiseSpaces();
}

/**
 * Processes incoming messages from extension pages and returns appropriate responses.
 * 
 * This function handles all message types sent from popup.html, spaces.html, and other
 * extension pages. It performs the requested action and returns data that will be
 * sent back to the requesting page via sendResponse().
 * 
 * @param {Object} request The message request object containing action and parameters.
 *     It must have an action string property. 
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<any|undefined>} Promise that resolves to:
 *   - Response data (any type) that will be sent to the caller
 *   - undefined when no response should be sent to the caller
 */
async function processMessage(request, sender) {
    let sessionId;
    let windowId;
    let tabId;

    // endpoints called by spaces.js
    switch (request.action) {
        case 'requestSessionPresence':
            return requestSessionPresence(request.sessionName);

        case 'requestSpaceFromWindowId':
            windowId = cleanParameter(request.windowId);
            if (windowId) {
                return requestSpaceFromWindowId(windowId);
            }
            return undefined;

        case 'requestCurrentSpace':
            return requestCurrentSpace();

        case 'generatePopupParams':
            // TODO: Investigate if || request.action should be removed.
            return generatePopupParams(request.popupAction || request.action, request.tabUrl);

        case 'loadSession':
            sessionId = cleanParameter(request.sessionId);
            if (sessionId) {
                await handleLoadSession(sessionId);
                return true;
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);
            return undefined;

        case 'loadWindow':
            windowId = cleanParameter(request.windowId);
            if (windowId) {
                await handleLoadWindow(windowId);
                return true;
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);
            return undefined;

        case 'loadTabInSession':
            sessionId = cleanParameter(request.sessionId);
            if (sessionId && request.tabUrl) {
                await handleLoadSession(sessionId, request.tabUrl);
                return true;
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);
            return undefined;

        case 'loadTabInWindow':
            windowId = cleanParameter(request.windowId);
            if (windowId && request.tabUrl) {
                await handleLoadWindow(windowId, request.tabUrl);
                return true;
            }
            // close the requesting tab (should be spaces.html)
            // if (!debug) closeChromeTab(sender.tab.id);
            return undefined;

        case 'saveNewSession':
            windowId = cleanParameter(request.windowId);
            if (windowId && request.sessionName) {
                return handleSaveNewSession(
                    windowId,
                    request.sessionName,
                    !!request.deleteOld
                );
            }
            return undefined;

        case 'importNewSession':
            if (request.urlList) {
                return handleImportNewSession(request.urlList);
            }
            return undefined;

        case 'restoreFromBackup':
            if (request.space) {
                return handleRestoreFromBackup(request.space, !!request.deleteOld);
            }
            return undefined;

        case 'deleteSession':
            sessionId = cleanParameter(request.sessionId);
            if (sessionId) {
                return handleDeleteSession(sessionId);
            }
            return undefined;

        case 'closeWindow':
            windowId = cleanParameter(request.windowId);
            if (!windowId) {
                return false;
            }
            
            try {
                await chrome.windows.get(windowId);
                await chrome.windows.remove(windowId);
                return true;
            } catch (error) {
                console.error("Error closing window:", error);
                return false;
            }

        case 'updateSessionName':
            sessionId = cleanParameter(request.sessionId);
            if (sessionId && request.sessionName) {
                return handleUpdateSessionName(
                    sessionId,
                    request.sessionName,
                    !!request.deleteOld
                );
            }
            return undefined;

        case 'requestSpaceDetail':
            windowId = cleanParameter(request.windowId);
            sessionId = cleanParameter(request.sessionId);

            if (windowId) {
                if (checkInternalSpacesWindows(windowId, false)) {
                    return false;
                } else {
                    return requestSpaceFromWindowId(windowId);
                }
            } else if (sessionId) {
                return requestSpaceFromSessionId(sessionId);
            }
            return undefined;

        // end points called by tag.js and switcher.js
        // note: some of these endpoints will close the requesting tab
        case 'requestAllSpaces':
            return requestAllSpaces();

        case 'requestTabDetail':
            tabId = cleanParameter(request.tabId);
            if (tabId) {
                const tab = await requestTabDetail(tabId);
                if (tab) {
                    return tab;
                } else {
                    // close the requesting tab (should be tab.html)
                    await closePopupWindow();
                }
            }
            return undefined;

        case 'requestShowSpaces':
            windowId = cleanParameter(request.windowId);

            // show the spaces tab in edit mode for the passed in windowId
            if (windowId) {
                await showSpacesOpenWindow(windowId, request.edit);
            } else {
                await showSpacesOpenWindow();
            }
            return undefined;

        case 'requestShowSwitcher':
            showSpacesSwitchWindow();
            return undefined;

        case 'requestShowMover':
            showSpacesMoveWindow();
            return undefined;

        case 'requestShowKeyboardShortcuts':
            createShortcutsWindow();
            return undefined;

        case 'requestClose':
            // close the requesting tab (should be tab.html)
            await closePopupWindow();
            return undefined;

        case 'switchToSpace':
            windowId = cleanParameter(request.windowId);
            sessionId = cleanParameter(request.sessionId);

            if (windowId) {
                await handleLoadWindow(windowId);
            } else if (sessionId) {
                await handleLoadSession(sessionId);
            }
            return true;

        case 'addLinkToNewSession':
            tabId = cleanParameter(request.tabId);
            if (request.sessionName && request.url) {
                const result = await handleAddLinkToNewSession(
                    request.url,
                    request.sessionName
                );
                if (result) updateSpacesWindow('addLinkToNewSession');

                // close the requesting tab (should be tab.html)
                closePopupWindow();
            }
            return undefined;

        case 'moveTabToNewSession':
            tabId = cleanParameter(request.tabId);
            if (request.sessionName && tabId) {
                const result = await handleMoveTabToNewSession(
                    tabId,
                    request.sessionName
                );
                if (result) updateSpacesWindow('moveTabToNewSession');

                // close the requesting tab (should be tab.html)
                closePopupWindow();
            }
            return undefined;

        case 'addLinkToSession':
            sessionId = cleanParameter(request.sessionId);

            if (sessionId && request.url) {
                const result = await handleAddLinkToSession(request.url, sessionId);
                if (result) updateSpacesWindow('addLinkToSession');

                // close the requesting tab (should be tab.html)
                closePopupWindow();
            }
            return undefined;

        case 'moveTabToSession':
            sessionId = cleanParameter(request.sessionId);
            tabId = cleanParameter(request.tabId);

            if (sessionId && tabId) {
                const result = await handleMoveTabToSession(tabId, sessionId);
                if (result) updateSpacesWindow('moveTabToSession');

                // close the requesting tab (should be tab.html)
                closePopupWindow();
            }
            return undefined;

        case 'addLinkToWindow':
            windowId = cleanParameter(request.windowId);

            if (windowId && request.url) {
                handleAddLinkToWindow(request.url, windowId);
                updateSpacesWindow('addLinkToWindow');

                // close the requesting tab (should be tab.html)
                closePopupWindow();
            }
            return undefined;

        case 'moveTabToWindow':
            windowId = cleanParameter(request.windowId);
            tabId = cleanParameter(request.tabId);

            if (windowId && tabId) {
                const result = await handleMoveTabToWindow(tabId, windowId);
                if (result) {
                    updateSpacesWindow('moveTabToWindow');
                }

                // close the requesting tab (should be tab.html)
                closePopupWindow();
            }
            return undefined;

        default:
            return undefined;
    }
}

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
        // Display on the left-hand side of the appropriate display.
        const workArea = await getTargetDisplayWorkArea();
        const windowHeight = Math.round(workArea.height * 0.9);
        const windowWidth = Math.min(workArea.width - 100, 1000);
        const window = await chrome.windows.create({
            type: 'popup',
            url,
            height: windowHeight,
            width: windowWidth,
            top: workArea.top,
            left: workArea.left,
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
        // Display in the lower-right corner of the appropriate display.
        const workArea = await getTargetDisplayWorkArea();
        const popupHeight = 450;
        const popupWidth = 310;
        const window = await chrome.windows.create({
            type: 'popup',
            url: popupUrl,
            focused: true,
            height: popupHeight,
            width: popupWidth,
            top: Math.round(workArea.top + workArea.height - popupHeight),
            left: Math.round(workArea.left + workArea.width - popupWidth),
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

        try {
            const allSpaces = await requestAllSpaces();
            chrome.runtime.sendMessage({
                action: 'updateSpaces',
                spaces: allSpaces,
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`updateSpacesWindow: Error updating spaces window: ${err}`);
        }
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
    return requestSpaceFromWindowId(window.id);
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

/**
 * Requests space details for a specific session ID.
 * 
 * @param {number} sessionId
 * @returns {Promise<Space|null>} Promise that resolves to:
 *   - Space object if session exists
 *   - null if session not found
 */
async function requestSpaceFromSessionId(sessionId) {
    const session = await dbService.fetchSessionById(sessionId);
    
    if (!session) {
        return null;
    }
    
    return {
        sessionId: session.id,
        windowId: session.windowId,
        name: session.name,
        tabs: session.tabs,
        history: session.history,
    };
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

        // Display new session over most of the appropriate display.
        const workArea = await getTargetDisplayWorkArea();
        const windowHeight = workArea.height - 100;
        const windowWidth = workArea.width - 100;
        const newWindow = await chrome.windows.create({
            url: urls,
            height: windowHeight,
            width: windowWidth,
            top: workArea.top,
            left: workArea.left,
        });

        // force match this new window to the session
        await spacesService.matchSessionToWindow(session, newWindow);

        // after window has loaded try to pin any previously pinned tabs
        for (const curSessionTab of session.tabs) {
            if (curSessionTab.pinned) {
                let pinnedTabId = false;
                newWindow.tabs.some(curNewTab => {
                    if (getEffectiveTabUrl(curNewTab) === curSessionTab.url) {
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
        await chrome.windows.update(windowId, { focused: true })
    }

    // if tabUrl is defined, then focus this tab
    if (tabUrl) {
        const theWin = await chrome.windows.get(windowId, { populate: true });
        await focusOrLoadTabInWindow(theWin, tabUrl);
    }
}

/**
 * Saves a new session from the specified window.
 * 
 * @param {number} windowId - The ID of the window to save as a session
 * @param {string} sessionName - The name for the new session
 * @param {boolean} deleteOld - Whether to delete existing session with same name
 * @returns {Promise<Session|false>} Promise that resolves to:
 *   - Session object if successfully saved
 *   - false if session save failed or name conflict without deleteOld
 */
async function handleSaveNewSession(windowId, sessionName, deleteOld) {
    const curWindow = await chrome.windows.get(windowId, { populate: true });
    const existingSession = await dbService.fetchSessionByName(sessionName);

    // if session with same name already exist, then prompt to override the existing session
    if (existingSession) {
        if (!deleteOld) {
            console.error(
                `handleSaveNewSession: Session with name "${sessionName}" already exists and deleteOld was not true.`
            );
            return false;

            // if we choose to overwrite, delete the existing session
        }
        await handleDeleteSession(existingSession.id);
    }
    const result = await spacesService.saveNewSession(
        sessionName,
        curWindow.tabs,
        curWindow.id
    );
    return result ?? false;
}

/**
 * Restores a session from backup data.
 * 
 * @param {Space} space - The space/session data to restore
 * @param {boolean} deleteOld - Whether to delete existing session with same name
 * @returns {Promise<Session|null>} Promise that resolves to:
 *   - Session object if successfully restored
 *   - null if session restoration failed or name conflict without deleteOld
 */
async function handleRestoreFromBackup(space, deleteOld) {
    const existingSession = space.name
        ? await dbService.fetchSessionByName(space.name)
        : false;

    // if session with same name already exist, then prompt to override the existing session
    if (existingSession) {
        if (!deleteOld) {
            console.error(
                `handleRestoreFromBackup: Session with name "${space.name}" already exists and deleteOld was not true.`
            );
            return null;
        }
        
        // if we choose to overwrite, delete the existing session
        await handleDeleteSession(existingSession.id);
    }

    return spacesService.saveNewSession(space.name, space.tabs, false);
}

/**
 * Imports a list of URLs as a new session with an auto-generated name.
 * 
 * @param {string[]} urlList - Array of URLs to import as tabs
 * @returns {Promise<Session|null>} Promise that resolves to:
 *   - Session object if successfully created
 *   - null if session creation failed
 */
async function handleImportNewSession(urlList) {
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
    return spacesService.saveNewSession(tempName, tabList, false);
}

/**
 * Updates the name of an existing session.
 * 
 * @param {number} sessionId - The ID of the session to rename
 * @param {string} sessionName - The new name for the session
 * @param {boolean} deleteOld - Whether to delete existing session with same name
 * @returns {Promise<Session|false>} Promise that resolves to:
 *   - Session object if successfully updated
 *   - false if session update failed or name conflict without deleteOld
 */
async function handleUpdateSessionName(sessionId, sessionName, deleteOld) {
    // check to make sure session name doesn't already exist
    const existingSession = await dbService.fetchSessionByName(sessionName);

    // if session with same name already exist, then prompt to override the existing session
    if (existingSession) {
        if (!deleteOld) {
            console.error(
                `handleUpdateSessionName: Session with name "${sessionName}" already exists and deleteOld was not true.`
            );
            return false;
        }
        
        // if we choose to override, then delete the existing session
        await handleDeleteSession(existingSession.id);
    }
    
    return spacesService.updateSessionName(sessionId, sessionName) ?? false;
}

/**
 * Deletes a session from the database and removes it from the cache.
 * 
 * @param {number} sessionId
 * @returns {Promise<boolean>} Promise that resolves to:
 *   - true if session was successfully deleted
 *   - false if session deletion failed or session not found
 */
async function handleDeleteSession(sessionId) {
    const session = await dbService.fetchSessionById(sessionId);
    if (!session) {
        console.error(`handleDeleteSession: No session found with id ${sessionId}`);
        return false;
    }

    return spacesService.deleteSession(sessionId);
}

/**
 * @param {string} url - The URL to add to the new session
 * @param {string} sessionName - The name for the new session
 * @returns {Promise<Session|null>} Promise that resolves to:
 *   - Session object if the session was successfully created
 *   - null if a session with that name already exists or creation failed
 */
async function handleAddLinkToNewSession(url, sessionName) {
    const session = await dbService.fetchSessionByName(sessionName);
    const newTabs = [{ url }];

    // if we found a session matching this name then return as an error as we are
    // supposed to be creating a new session with this name
    if (session) {
        return null;

        // else create a new session with this name containing this url
    } else {
        return spacesService.saveNewSession(sessionName, newTabs, false);
    }
}

/**
 * @param {number} tabId - The ID of the tab to move to the new session
 * @param {string} sessionName - The name for the new session
 * @returns {Promise<Session|null>} Promise that resolves to:
 *   - Session object if the session was successfully created
 *   - null if a session with that name already exists or creation failed
 */
async function handleMoveTabToNewSession(tabId, sessionName) {
    const tab = await requestTabDetail(tabId);
    if (!tab) {
        return null;
    }

    const session = await dbService.fetchSessionByName(sessionName);

    // if we found a session matching this name then return as an error as we are
    // supposed to be creating a new session with this name
    if (session) {
        return null;

        //  else create a new session with this name containing this tab
    } else {
        // remove tab from current window (should generate window events)
        chrome.tabs.remove(tab.id);

        // save session to database
        return spacesService.saveNewSession(
            sessionName,
            [tab],
            false
        );
    }
}

/**
 * Adds a link to an existing session.
 * 
 * @param {string} url - The URL to add to the session
 * @param {number} sessionId - The ID of the session to add the link to
 * @returns {Promise<boolean>} Promise that resolves to:
 *   - true if the link was successfully added
 *   - false if the session was not found or addition failed
 */
async function handleAddLinkToSession(url, sessionId) {
    const session = await dbService.fetchSessionById(sessionId);
    const newTabs = [{ url }];

    // if we have not found a session matching this name then return as an error as we are
    // supposed to be adding the tab to an existing session
    if (!session) {
        return false;
    }
    // if session is currently open then add link directly
    if (session.windowId) {
        handleAddLinkToWindow(url, session.windowId);
        return true;

        // else add tab to saved session in database
    } else {
        // update session in db
        session.tabs = session.tabs.concat(newTabs);
        const result = await spacesService.updateSessionTabs(session.id, session.tabs);
        return !!result;
    }
}

/**
 * Adds a link to a window by creating a new tab.
 * 
 * @param {string} url - The URL to create a tab for
 * @param {number} windowId - The ID of the window to add the tab to
 */
function handleAddLinkToWindow(url, windowId) {
    chrome.tabs.create({ windowId, url, active: false });

    // NOTE: this move does not seem to trigger any tab event listeners
    // so we need to update sessions manually
    spacesService.queueWindowEvent(windowId);
}

/**
 * Moves a tab to an existing session.
 * 
 * @param {number} tabId - The ID of the tab to move
 * @param {number} sessionId - The ID of the session to move the tab to
 * @returns {Promise<boolean>} Promise that resolves to:
 *   - true if the tab was successfully moved
 *   - false if the tab or session was not found or move failed
 */
async function handleMoveTabToSession(tabId, sessionId) {
    const tab = await requestTabDetail(tabId);
    if (!tab) {
        return false;
    }

    const session = await dbService.fetchSessionById(sessionId);
    const newTabs = [tab];

    // if we have not found a session matching this name then return as an error as we are
    // supposed to be adding the tab to an existing session
    if (!session) {
        return false;
    }
    
    // if session is currently open then move it directly
    if (session.windowId) {
        moveTabToWindow(tab, session.windowId);
        return true;
    }

    // else add tab to saved session in database
    // remove tab from current window
    chrome.tabs.remove(tab.id);

    // update session in db
    session.tabs = session.tabs.concat(newTabs);
    return !!spacesService.updateSessionTabs(session.id, session.tabs);
}

/**
 * @param {number} tabId
 * @param {number} windowId
 * @returns {Promise<boolean>} Promise that resolves to:
 *   - true if the tab was successfully moved
 *   - false if the tab was not found or move failed
 */
async function handleMoveTabToWindow(tabId, windowId) {
    const tab = await requestTabDetail(tabId);
    if (!tab) {
        return false;
    }
    moveTabToWindow(tab, windowId);
    return true;
}

/**
 * @param {chrome.tabs.Tab} tab
 * @param {number} windowId The ID of the destination window.
 */
function moveTabToWindow(tab, windowId) {
    chrome.tabs.move(tab.id, { windowId, index: -1 });

    // NOTE: this move does not seem to trigger any tab event listeners
    // so we need to update sessions manually
    spacesService.queueWindowEvent(tab.windowId);
    spacesService.queueWindowEvent(windowId);
}

// Module-level helper functions.

/**
 * Ensures the parameter is a number.
 * @param {string|number} param - The parameter to clean.
 * @returns {number} - The cleaned parameter.
 */
function cleanParameter(param) {
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

/**
 * Searches for a tab with a specific URL within a given window.
 * If a matching tab is found, it is brought into focus.
 * If no matching tab is found, a new tab with the specified URL is created and activated.
 * Note: The new tab is created in the current window, not necessarily the one passed as a parameter.
 *
 * @param {chrome.windows.Window} window The window object to search for the tab in. It should contain a `tabs` array.
 * @param {string} tabUrl The URL of the tab to find or create.
 * @returns {Promise<void>} A promise that resolves once the tab is focused or created.
 */
async function focusOrLoadTabInWindow(window, tabUrl) {
    let match = false;
    for (const tab of window.tabs || []) {
        if (getEffectiveTabUrl(tab) === tabUrl) {
            await chrome.tabs.update(tab.id, { active: true });
            match = true;
            break;
        }
    }

    if (!match) {
        await chrome.tabs.create({ url: tabUrl, active: true });
    }
}

/**
 * Gets the effective URL of a tab, preferring pendingUrl for loading tabs.
 * @param {chrome.tabs.Tab} tab The tab object to get the effective URL from.
 * @returns {string} The effective URL of the tab.
 */
function getEffectiveTabUrl(tab) {
    if (tab.status === 'loading' && tab.pendingUrl) {
        return tab.pendingUrl;
    }
    return tab.url;
}

/**
 * Determines the most appropriate display to show a new window on.
 * It prefers the display containing the currently focused Chrome window.
 * If no window is focused, it falls back to the primary display.
 * @returns {Promise<chrome.system.display.Bounds>} A promise that resolves to the work area bounds of the target display.
 */
async function getTargetDisplayWorkArea() {
    const [displays, currentWindow] = await Promise.all([
        chrome.system.display.getInfo(),
        chrome.windows.getCurrent().catch(() => null) // Catch if no window is focused
    ]);

    let targetDisplay = displays.find(d => d.isPrimary) || displays[0]; // Default to primary

    // Find the display that contains the center of the current window
    if (currentWindow) {
        const windowCenterX = currentWindow.left + currentWindow.width / 2;
        const windowCenterY = currentWindow.top + currentWindow.height / 2;
        const activeDisplay = displays.find(display => {
            const d = display.workArea;
            return windowCenterX >= d.left && windowCenterX < (d.left + d.width) &&
                   windowCenterY >= d.top && windowCenterY < (d.top + d.height);
        });
        if (activeDisplay) {
            targetDisplay = activeDisplay;
        }
    }

    return targetDisplay.workArea;
}

/**
 * Requests all spaces (sessions) from the database.
 * 
 * @returns {Promise<Space[]>} Promise that resolves to an array of Space objects
 */
async function requestAllSpaces() {
    // Get all sessions from spacesService (includes both saved and temporary open window sessions)
    const allSessions = await spacesService.getAllSessions();
    /** @type {Space[]} */
    const allSpaces = allSessions
        .map(session => {
            return { sessionId: session.id, ...session };
        })
        .filter(session => {
            return session && session.tabs && session.tabs.length > 0;
        });

    // sort results
    allSpaces.sort((a, b) => {
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
    });

    return allSpaces;
}

// Exports for testing.
export {
    cleanParameter,
    focusOrLoadTabInWindow,
    getEffectiveTabUrl,
    getTargetDisplayWorkArea,
    requestAllSpaces,
};
