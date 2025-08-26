/* global chrome, dbService */

/* spaces
 * Copyright (C) 2015 Dean Oemcke
 */

import { dbService } from './dbService.js';

// TODO(codedread): Eliminate all global variables and use chrome.storage.local. 

// eslint-disable-next-line no-var
export var spacesService = {
    tabHistoryUrlMap: {},
    closedWindowIds: {},
    sessions: [],
    sessionUpdateTimers: {},
    historyQueue: [],
    eventQueueCount: 0,
    debug: true,
    initialized: false,
    initializationPromise: null,

    noop: () => {},

    // Ensure spacesService is initialized before processing events
    async ensureInitialized() {
        if (spacesService.initialized) {
            return;
        }
        
        if (spacesService.initializationPromise) {
            await spacesService.initializationPromise;
            return;
        }
        
        spacesService.initializationPromise = spacesService.initialiseSpaces().then(() => {
            spacesService.initialized = true;
            spacesService.initializationPromise = null;
        });
        
        await spacesService.initializationPromise;
    },

    // initialise spaces - combine open windows with saved sessions
    async initialiseSpaces() {
        spacesService.initialized = false; // Reset on re-initialization
        console.log(`Inside spacesService.initialiseSpaces()`);
        // update version numbers
        const lastVersion = await spacesService.fetchLastVersion();
        spacesService.setLastVersion(chrome.runtime.getManifest().version);

        try {
            const sessions = await dbService.fetchAllSessions();
            
            if (
                chrome.runtime.getManifest().version === '0.18' &&
                chrome.runtime.getManifest().version !== lastVersion
            ) {
                await spacesService.resetAllSessionHashes(sessions);
            }

            chrome.windows.getAll({ populate: true }, async windows => {
                // populate session map from database
                spacesService.sessions = sessions;

                // clear any previously saved windowIds both in memory and database
                for (const session of spacesService.sessions) {
                    if (session.windowId) {
                        session.windowId = false;
                        // Persist the cleared windowId to database
                        await dbService.updateSession(session);
                    }
                }

                // then try to match current open windows with saved sessions
                for (const curWindow of windows) {
                    if (!spacesService.filterInternalWindows(curWindow)) {
                        await spacesService.checkForSessionMatch(curWindow);
                    }
                }
                
                // Initialization complete
                spacesService.initialized = true;
            });
        } catch (error) {
            console.error('Error initializing spaces:', error);
            spacesService.initialized = false;
        }
    },

    async resetAllSessionHashes(sessions) {
        for (const session of sessions) {
            // eslint-disable-next-line no-param-reassign
            session.sessionHash = spacesService.generateSessionHash(
                session.tabs
            );
            await dbService.updateSession(session);
        }
    },

    // record each tab's id and url so we can add history items when tabs are removed
    initialiseTabHistory() {
        chrome.tabs.query({}, tabs => {
            tabs.forEach(async tab => {
                spacesService.tabHistoryUrlMap[tab.id] = tab.url;
            });
        });
    },

    // NOTE: if ever changing this funciton, then we'll need to update all
    // saved sessionHashes so that they match next time, using: resetAllSessionHashes()
    _cleanUrl(url) {
        if (!url) {
            return '';
        }

        // ignore urls from this extension
        if (url.indexOf(chrome.runtime.id) >= 0) {
            return '';
        }

        // ignore 'new tab' pages
        if (url.indexOf('chrome:// newtab/') >= 0) {
            return '';
        }

        let cleanUrl = url;

        // add support for 'The Great Suspender'
        if (
            cleanUrl.indexOf('suspended.html') > 0 &&
            cleanUrl.indexOf('uri=') > 0
        ) {
            cleanUrl = cleanUrl.substring(
                cleanUrl.indexOf('uri=') + 4,
                cleanUrl.length
            );
        }

        // remove any text after a '#' symbol
        if (cleanUrl.indexOf('#') > 0) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.indexOf('#'));
        }

        // remove any text after a '?' symbol
        if (cleanUrl.indexOf('?') > 0) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.indexOf('?'));
        }

        return cleanUrl;
    },

    generateSessionHash(tabs) {
        const text = tabs.reduce((prevStr, tab) => {
            return prevStr + spacesService._cleanUrl(tab.url);
        }, '');

        let hash = 0;
        if (text.length === 0) return hash;
        for (let i = 0, len = text.length; i < len; i += 1) {
            const chr = text.charCodeAt(i);
            // eslint-disable-next-line no-bitwise
            hash = (hash << 5) - hash + chr;
            // eslint-disable-next-line no-bitwise
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash);
    },

    filterInternalWindows(curWindow) {
        // sanity check to make sure window isnt an internal spaces window
        if (
            curWindow.tabs.length === 1 &&
            curWindow.tabs[0].url.indexOf(chrome.runtime.id) >= 0
        ) {
            return true;
        }

        // also filter out popup or panel window types
        if (curWindow.type === 'popup' || curWindow.type === 'panel') {
            return true;
        }
        return false;
    },

    async checkForSessionMatch(curWindow) {
        if (!curWindow.tabs || curWindow.tabs.length === 0) {
            return;
        }

        const sessionHash = spacesService.generateSessionHash(curWindow.tabs);
        const temporarySession = await dbService.fetchSessionByWindowId(
            curWindow.id
        );
        
        // Find matching session by hash (closedOnly = true)
        let matchingSession = false;
        try {
            const sessions = await dbService.fetchAllSessions();
            const matchedSession = sessions.find(session => {
                return session.sessionHash === sessionHash && !session.windowId;
            });
            matchingSession = matchedSession || false;
        } catch (error) {
            console.error('Error fetching session by hash:', error);
            matchingSession = false;
        }

        if (matchingSession) {
            if (spacesService.debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `matching session found: ${matchingSession.id}. linking with window: ${curWindow.id}`
                );
            }

            spacesService.matchSessionToWindow(matchingSession, curWindow);
        }

        // if no match found and this window does not already have a temporary session
        if (!matchingSession && !temporarySession) {
            if (spacesService.debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `no matching session found. creating temporary session for window: ${curWindow.id}`
                );
            }

            // create a new temporary session for this window (with no sessionId or name)
            spacesService.createTemporaryUnmatchedSession(curWindow);
        }
    },

    async matchSessionToWindow(session, curWindow) {
        // remove any other sessions tied to this windowId (temporary sessions)
        for (let i = spacesService.sessions.length - 1; i >= 0; i -= 1) {
            if (spacesService.sessions[i].windowId === curWindow.id) {
                if (spacesService.sessions[i].id) {
                    spacesService.sessions[i].windowId = false;
                    // Persist the cleared windowId to database
                    await dbService.updateSession(spacesService.sessions[i]);
                } else {
                    spacesService.sessions.splice(i, 1);
                }
            }
        }

        // assign windowId to newly matched session
        // eslint-disable-next-line no-param-reassign
        session.windowId = curWindow.id;
        
        // Persist the new windowId association to database
        if (session.id) {
            await dbService.updateSession(session);
        }
    },

    async createTemporaryUnmatchedSession(curWindow) {
        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.dir(spacesService.sessions);
            // eslint-disable-next-line no-console
            console.dir(curWindow);
            // eslint-disable-next-line no-alert
            // alert('couldnt match window. creating temporary session');
        }

        const sessionHash = spacesService.generateSessionHash(curWindow.tabs);

        spacesService.sessions.push({
            id: false,
            windowId: curWindow.id,
            sessionHash,
            name: false,
            tabs: curWindow.tabs,
            history: [],
            lastAccess: new Date(),
        });
    },

    // local storage getters/setters
    async fetchLastVersion() {
        let version = await chrome.storage.local.get(['spacesVersion']);
        if (version !== null && version['spacesVersion']) {
            version = JSON.parse(version['spacesVersion']);
            return version;
        }
        return 0;
    },

    setLastVersion(newVersion) {
        chrome.storage.local.set({'spacesVersion': JSON.stringify(newVersion)});
    },

    // event listener functions for window and tab events
    // (events are received and screened first in background.js)
    // -----------------------------------------------------------------------------------------

    async handleTabRemoved(tabId, removeInfo, callback) {
        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log(
                `handlingTabRemoved event. windowId: ${removeInfo.windowId}`
            );
        }

        // NOTE: isWindowClosing is true if the window cross was clicked causing the tab to be removed.
        // If the tab cross is clicked and it is the last tab in the window
        // isWindowClosing will still be false even though the window will close
        if (removeInfo.isWindowClosing) {
            // be very careful here as we definitley do not want these removals being saved
            // as part of the session (effectively corrupting the session)

            // should be handled by the window removed listener
            spacesService.handleWindowRemoved(
                removeInfo.windowId,
                true,
                spacesService.noop
            );

            // if this is a legitimate single tab removal from a window then update session/window
        } else {
            spacesService.historyQueue.push({
                url: spacesService.tabHistoryUrlMap[tabId],
                windowId: removeInfo.windowId,
                action: 'add',
            });
            spacesService.queueWindowEvent(
                removeInfo.windowId,
                spacesService.eventQueueCount,
                callback
            );

            // remove tab from tabHistoryUrlMap
            delete spacesService.tabHistoryUrlMap[tabId];
        }
    },

    handleTabMoved(tabId, moveInfo, callback) {
        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log(
                `handlingTabMoved event. windowId: ${moveInfo.windowId}`
            );
        }
        spacesService.queueWindowEvent(
            moveInfo.windowId,
            spacesService.eventQueueCount,
            callback
        );
    },

    async handleTabUpdated(tab, changeInfo, callback) {
        // NOTE: only queue event when tab has completed loading (title property exists at this point)
        if (tab.status === 'complete') {
            if (spacesService.debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `handlingTabUpdated event. windowId: ${tab.windowId}`
                );
            }

            // update tab history in case the tab url has changed
            spacesService.tabHistoryUrlMap[tab.id] = tab.url;
            spacesService.queueWindowEvent(
                tab.windowId,
                spacesService.eventQueueCount,
                callback
            );
        }

        // check for change in tab url. if so, update history
        if (changeInfo.url) {
            // add tab to history queue as an item to be removed (as it is open for this window)
            spacesService.historyQueue.push({
                url: changeInfo.url,
                windowId: tab.windowId,
                action: 'remove',
            });
        }
    },

    async handleWindowRemoved(windowId, markAsClosed, callback) {
        // ignore subsequent windowRemoved events for the same windowId (each closing tab will try to call this)
        if (spacesService.closedWindowIds[windowId]) {
            callback();
        }

        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log(`handlingWindowRemoved event. windowId: ${windowId}`);
        }

        // add windowId to closedWindowIds. the idea is that once a window is closed it can never be
        // rematched to a new session (hopefully these window ids never get legitimately re-used)
        if (markAsClosed) {
            if (spacesService.debug) {
                // eslint-disable-next-line no-console
                console.log(`adding window to closedWindowIds: ${windowId}`);
            }

            spacesService.closedWindowIds[windowId] = true;
            clearTimeout(spacesService.sessionUpdateTimers[windowId]);
        }

        const session = await dbService.fetchSessionByWindowId(windowId);
        if (session) {
            // if this is a saved session then just remove the windowId reference
            if (session.id) {
                session.windowId = false;
                // Persist the cleared windowId to database
                await dbService.updateSession(session);

                // else if it is temporary session then remove the session from the cache
            } else {
                spacesService.sessions.some((curSession, index) => {
                    if (curSession.windowId === windowId) {
                        spacesService.sessions.splice(index, 1);
                        return true;
                    }
                    return false;
                });
            }
        }

        callback();
    },

    async handleWindowFocussed(windowId) {
        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log(`handleWindowFocussed event. windowId: ${windowId}`);
        }

        if (windowId <= 0) {
            return;
        }

        const session = await dbService.fetchSessionByWindowId(windowId);
        if (session) {
            session.lastAccess = new Date();
        }
    },

    // 1sec timer-based batching system.
    // Set a timeout so that multiple tabs all opened at once (like when restoring a session)
    // only trigger this function once (as per the timeout set by the last tab event)
    // This will cause multiple triggers if time between tab openings is longer than 1 sec
    queueWindowEvent(windowId, eventId, callback) {
        clearTimeout(spacesService.sessionUpdateTimers[windowId]);

        spacesService.eventQueueCount += 1;

        spacesService.sessionUpdateTimers[windowId] = setTimeout(() => {
            spacesService.handleWindowEvent(windowId, eventId, callback);
        }, 1000);
    },

    // careful here as this function gets called A LOT
    handleWindowEvent(windowId, eventId, callback) {
        // eslint-disable-next-line no-param-reassign
        callback =
            typeof callback !== 'function' ? spacesService.noop : callback;

        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log('------------------------------------------------');

            // eslint-disable-next-line no-console
            console.log(
                `event: ${eventId}. attempting session update. windowId: ${windowId}`
            );
        }

        // sanity check windowId
        if (!windowId || windowId <= 0) {
            if (spacesService.debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `received an event for windowId: ${windowId} which is obviously wrong`
                );
            }
            return;
        }

        chrome.windows.get(windowId, { populate: true }, async curWindow => {
            if (chrome.runtime.lastError) {
                // eslint-disable-next-line no-console
                console.log(
                    `${chrome.runtime.lastError.message}. perhaps its the development console???`
                );

                // if we can't find this window, then better remove references to it from the cached sessions
                // don't mark as a removed window however, so that the space can be resynced up if the window
                // does actually still exist (for some unknown reason)
                spacesService.handleWindowRemoved(
                    windowId,
                    false,
                    spacesService.noop
                );
                return;
            }

            if (!curWindow || spacesService.filterInternalWindows(curWindow)) {
                return;
            }

            // don't allow event if it pertains to a closed window id
            if (spacesService.closedWindowIds[windowId]) {
                if (spacesService.debug) {
                    // eslint-disable-next-line no-console
                    console.log(
                        `ignoring event as it pertains to a closed windowId: ${windowId}`
                    );
                }
                return;
            }

            // if window is associated with an open session then update session
            const session = await dbService.fetchSessionByWindowId(windowId);

            if (session) {
                if (spacesService.debug) {
                    // eslint-disable-next-line no-console
                    console.log(
                        `tab statuses: ${curWindow.tabs
                            .map(curTab => {
                                return curTab.status;
                            })
                            .join('|')}`
                    );
                }

                // look for tabs recently added/removed from this session and update session history
                const historyItems = spacesService.historyQueue.filter(
                    historyItem => {
                        return historyItem.windowId === windowId;
                    }
                );

                for (let i = historyItems.length - 1; i >= 0; i -= 1) {
                    const historyItem = historyItems[i];

                    if (historyItem.action === 'add') {
                        spacesService.addUrlToSessionHistory(
                            session,
                            historyItem.url
                        );
                    } else if (historyItem.action === 'remove') {
                        spacesService.removeUrlFromSessionHistory(
                            session,
                            historyItem.url
                        );
                    }
                    spacesService.historyQueue.splice(i, 1);
                }

                // override session tabs with tabs from window
                session.tabs = curWindow.tabs;
                session.sessionHash = spacesService.generateSessionHash(
                    session.tabs
                );

                // if it is a saved session then update db
                if (session.id) {
                    spacesService.saveExistingSession(session.id);
                }
            }

            // if no session found, it must be a new window.
            // if session found without session.id then it must be a temporary session
            // check for sessionMatch
            if (!session || !session.id) {
                if (spacesService.debug) {
                    // eslint-disable-next-line no-console
                    console.log('session check triggered');
                }
                spacesService.checkForSessionMatch(curWindow);
            }
            callback();
        });
    },

    // PUBLIC FUNCTIONS

    addUrlToSessionHistory(session, newUrl) {
        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log(`adding tab to history: ${newUrl}`);
        }

        const cleanUrl = spacesService._cleanUrl(newUrl);

        if (cleanUrl.length === 0) {
            return false;
        }

        // don't add removed tab to history if there is still a tab open with same url
        // note: assumes tab has NOT already been removed from session.tabs
        const tabBeingRemoved = session.tabs.filter(curTab => {
            return spacesService._cleanUrl(curTab.url) === cleanUrl;
        });

        if (tabBeingRemoved.length !== 1) {
            return false;
        }

        // eslint-disable-next-line no-param-reassign
        if (!session.history) session.history = [];

        // see if tab already exists in history. if so then remove it (it will be re-added)
        session.history.some((historyTab, index) => {
            if (spacesService._cleanUrl(historyTab.url) === cleanUrl) {
                session.history.splice(index, 1);
                return true;
            }
            return false;
        });

        // add url to session history
        // eslint-disable-next-line no-param-reassign
        session.history = tabBeingRemoved.concat(session.history);

        // trim history for this space down to last 200 items
        // eslint-disable-next-line no-param-reassign
        session.history = session.history.slice(0, 200);

        return session;
    },

    removeUrlFromSessionHistory(session, newUrl) {
        if (spacesService.debug) {
            // eslint-disable-next-line no-console
            console.log(`removing tab from history: ${newUrl}`);
        }

        // eslint-disable-next-line no-param-reassign
        newUrl = spacesService._cleanUrl(newUrl);

        if (newUrl.length === 0) {
            return;
        }

        // see if tab already exists in history. if so then remove it
        session.history.some((historyTab, index) => {
            if (spacesService._cleanUrl(historyTab.url) === newUrl) {
                session.history.splice(index, 1);
                return true;
            }
            return false;
        });
    },

    // Database actions

    async updateSessionTabs(sessionId, tabs, callback) {
        const session = await dbService.fetchSessionById(sessionId);

        // eslint-disable-next-line no-param-reassign
        callback =
            typeof callback !== 'function' ? spacesService.noop : callback;

        // update tabs in session
        session.tabs = tabs;
        session.sessionHash = spacesService.generateSessionHash(session.tabs);

        spacesService.saveExistingSession(session.id, callback);
    },

    async updateSessionName(sessionId, sessionName, callback) {
        // eslint-disable-next-line no-param-reassign
        callback =
            typeof callback !== 'function' ? spacesService.noop : callback;

        const session = await dbService.fetchSessionById(sessionId);
        session.name = sessionName;

        spacesService.saveExistingSession(session.id, callback);
    },

    async saveExistingSession(sessionId, callback) {
        const session = await dbService.fetchSessionById(sessionId);

        // eslint-disable-next-line no-param-reassign
        callback =
            typeof callback !== 'function' ? spacesService.noop : callback;

        try {
            const updatedSession = await dbService.updateSession(session);
            callback(updatedSession);
        } catch (error) {
            console.error('Error saving existing session:', error);
            callback(null);
        }
    },

    async saveNewSession(sessionName, tabs, windowId, callback) {
        if (!tabs) {
            callback();
            return;
        }

        const sessionHash = spacesService.generateSessionHash(tabs);
        let session;

        // eslint-disable-next-line no-param-reassign
        callback =
            typeof callback !== 'function' ? spacesService.noop : callback;

        // check for a temporary session with this windowId
        if (windowId) {
            session = await dbService.fetchSessionByWindowId(windowId);
        }

        // if no temporary session found with this windowId, then create one
        if (!session) {
            session = {
                windowId,
                history: [],
            };
            spacesService.sessions.push(session);
        }

        // update temporary session details
        session.name = sessionName;
        session.sessionHash = sessionHash;
        session.tabs = tabs;
        session.lastAccess = new Date();

        // save session to db
        try {
            const savedSession = await dbService.createSession(session);
            if (savedSession) {
                // update sessionId in cache
                session.id = savedSession.id;
                callback(savedSession);
            } else {
                console.error('Failed to create session');
                callback(false);
            }
        } catch (error) {
            console.error('Error creating session:', error);
            callback(false);
        }
    },

    async deleteSession(sessionId, callback) {
        // eslint-disable-next-line no-param-reassign
        callback =
            typeof callback !== 'function' ? spacesService.noop : callback;

        try {
            const success = await dbService.removeSession(sessionId);
            if (success) {
                // remove session from cached array
                spacesService.sessions.some((session, index) => {
                    if (session.id === sessionId) {
                        spacesService.sessions.splice(index, 1);
                        return true;
                    }
                    return false;
                });
            }
            callback(success);
        } catch (error) {
            console.error('Error deleting session:', error);
            callback(false);
        }
    },
};
