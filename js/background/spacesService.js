/* global chrome, dbService */

/* spaces
 * Copyright (C) 2015 Dean Oemcke
 */

/** @typedef {import('./dbService.js').Session} Session */

import { dbService } from './dbService.js';

// Module-level properties
const debug = false;
const noop = () => {};

class SpacesService {
    constructor() {
        this.tabHistoryUrlMap = {};
        this.closedWindowIds = {};
        this.sessions = [];
        this.sessionUpdateTimers = {};
        this.historyQueue = [];
        this.eventQueueCount = 0;
        this.initialized = false;
        this.initializationPromise = null;
    }

    // Ensure spacesService is initialized before processing events
    async ensureInitialized() {
        if (this.initialized) {
            return;
        }
        
        if (this.initializationPromise) {
            await this.initializationPromise;
            return;
        }
        
        this.initializationPromise = this.initialiseSpaces().then(async () => {
            await this._initialiseTabHistory();
            this.initialized = true;
            this.initializationPromise = null;
        });
        
        await this.initializationPromise;
    }

    // initialise spaces - combine open windows with saved sessions
    async initialiseSpaces() {
        this.initialized = false; // Reset on re-initialization

        // update version numbers
        const lastVersion = await this.fetchLastVersion();
        this.setLastVersion(chrome.runtime.getManifest().version);

        try {
            const sessions = await dbService.fetchAllSessions();
            
            if (
                chrome.runtime.getManifest().version === '0.18' &&
                chrome.runtime.getManifest().version !== lastVersion
            ) {
                await this.resetAllSessionHashes(sessions);
            }

            const windows = await chrome.windows.getAll({ populate: true });
            // populate session map from database
            this.sessions = sessions;

            // then try to match current open windows with saved sessions
            for (const curWindow of windows) {
                if (!this.filterInternalWindows(curWindow)) {
                    await this.checkForSessionMatchDuringInit(curWindow);
                }
            }
            
            // Initialization complete
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing spaces:', error);
            this.initialized = false;
        }
    }

    // Clear windowId associations after Chrome restart (when window IDs get reassigned)
    async clearWindowIdAssociations() {
        try {
            const sessions = await dbService.fetchAllSessions();
            
            // clear any previously saved windowIds both in memory and database
            for (const session of sessions) {
                if (session.windowId) {
                    session.windowId = false;
                    // Persist the cleared windowId to database
                    await dbService.updateSession(session);
                }
            }
            
            // Also clear from in-memory cache if it's already loaded
            if (this.sessions && this.sessions.length > 0) {
                for (const session of this.sessions) {
                    if (session.windowId) {
                        session.windowId = false;
                    }
                }
            }
        } catch (error) {
            console.error('Error clearing window ID associations:', error);
        }
    }

    async resetAllSessionHashes(sessions) {
        for (const session of sessions) {
            // eslint-disable-next-line no-param-reassign
            session.sessionHash = generateSessionHash(
                session.tabs
            );
            await dbService.updateSession(session);
        }
    }

    /**
     * Record each tab's id and url so we can add history items when tabs are removed
     * @private
     */
    async _initialiseTabHistory() {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            this.tabHistoryUrlMap[tab.id] = tab.url;
        }
    }

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
    }

    async checkForSessionMatchDuringInit(curWindow) {
        if (!curWindow.tabs || curWindow.tabs.length === 0) {
            return;
        }

        // First, check if there's already a session with this windowId (service worker reactivation case)
        let existingSession = null;
        try {
            existingSession = await dbService.fetchSessionByWindowId(curWindow.id);
        } catch (error) {
            console.error('Error fetching session by windowId:', error);
        }

        if (existingSession) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `existing session found for windowId: ${curWindow.id}. session: ${existingSession.id || 'temporary'}`
                );
            }
            // Session already exists for this window, no need to create or match anything
            return;
        }

        // If no existing session, fall back to hash matching (Chrome restart case)
        await this.checkForSessionMatch(curWindow);
    }

    async checkForSessionMatch(curWindow) {
        if (!curWindow.tabs || curWindow.tabs.length === 0) {
            return;
        }

        const sessionHash = generateSessionHash(curWindow.tabs);
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
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `matching session found: ${matchingSession.id}. linking with window: ${curWindow.id}`
                );
            }

            this.matchSessionToWindow(matchingSession, curWindow);
        }

        // if no match found and this window does not already have a temporary session
        if (!matchingSession && !temporarySession) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `no matching session found. creating temporary session for window: ${curWindow.id}`
                );
            }

            // create a new temporary session for this window (with no sessionId or name)
            this.createTemporaryUnmatchedSession(curWindow);
        }
    }

    async matchSessionToWindow(session, curWindow) {
        await this.ensureInitialized();
        
        // remove any other sessions tied to this windowId (temporary sessions)
        for (let i = this.sessions.length - 1; i >= 0; i -= 1) {
            if (this.sessions[i].windowId === curWindow.id) {
                if (this.sessions[i].id) {
                    this.sessions[i].windowId = false;
                    // Persist the cleared windowId to database
                    await dbService.updateSession(this.sessions[i]);
                } else {
                    this.sessions.splice(i, 1);
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
    }

    async createTemporaryUnmatchedSession(curWindow) {
        if (debug) {
            // eslint-disable-next-line no-console
            console.dir(this.sessions);
            // eslint-disable-next-line no-console
            console.dir(curWindow);
            // eslint-disable-next-line no-alert
            // alert('couldnt match window. creating temporary session');
        }

        const sessionHash = generateSessionHash(curWindow.tabs);

        this.sessions.push({
            id: false,
            windowId: curWindow.id,
            sessionHash,
            name: false,
            tabs: curWindow.tabs,
            history: [],
            lastAccess: new Date(),
        });
    }

    // local storage getters/setters
    async fetchLastVersion() {
        let version = await chrome.storage.local.get(['spacesVersion']);
        if (version !== null && version['spacesVersion']) {
            version = JSON.parse(version['spacesVersion']);
            return version;
        }
        return 0;
    }

    setLastVersion(newVersion) {
        chrome.storage.local.set({'spacesVersion': JSON.stringify(newVersion)});
    }

    // event listener functions for window and tab events
    // (events are received and screened first in background.js)
    // -----------------------------------------------------------------------------------------

    async handleTabRemoved(tabId, removeInfo, callback) {
        await this.ensureInitialized();
        
        if (debug) {
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
            this.handleWindowRemoved(
                removeInfo.windowId,
                true
            );

            // if this is a legitimate single tab removal from a window then update session/window
        } else {
            this.historyQueue.push({
                url: this.tabHistoryUrlMap[tabId],
                windowId: removeInfo.windowId,
                action: 'add',
            });
            this.queueWindowEvent(
                removeInfo.windowId,
                this.eventQueueCount,
                callback
            );

            // remove tab from tabHistoryUrlMap
            delete this.tabHistoryUrlMap[tabId];
        }
    }

    async handleTabMoved(tabId, moveInfo, callback) {
        await this.ensureInitialized();
        
        if (debug) {
            // eslint-disable-next-line no-console
            console.log(
                `handlingTabMoved event. windowId: ${moveInfo.windowId}`
            );
        }
        this.queueWindowEvent(
            moveInfo.windowId,
            this.eventQueueCount,
            callback
        );
    }

    async handleTabUpdated(tab, changeInfo, callback) {
        await this.ensureInitialized();
        
        // NOTE: only queue event when tab has completed loading (title property exists at this point)
        if (tab.status === 'complete') {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `handlingTabUpdated event. windowId: ${tab.windowId}`
                );
            }

            // update tab history in case the tab url has changed
            this.tabHistoryUrlMap[tab.id] = tab.url;
            this.queueWindowEvent(
                tab.windowId,
                this.eventQueueCount,
                callback
            );
        }

        // check for change in tab url. if so, update history
        if (changeInfo.url) {
            // add tab to history queue as an item to be removed (as it is open for this window)
            this.historyQueue.push({
                url: changeInfo.url,
                windowId: tab.windowId,
                action: 'remove',
            });
        }
    }

    async handleWindowRemoved(windowId, markAsClosed, callback = noop) {
        await this.ensureInitialized();
        
        // ignore subsequent windowRemoved events for the same windowId (each closing tab will try to call this)
        if (this.closedWindowIds[windowId]) {
            callback();
        }

        if (debug) {
            // eslint-disable-next-line no-console
            console.log(`handlingWindowRemoved event. windowId: ${windowId}`);
        }

        // add windowId to closedWindowIds. the idea is that once a window is closed it can never be
        // rematched to a new session (hopefully these window ids never get legitimately re-used)
        if (markAsClosed) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(`adding window to closedWindowIds: ${windowId}`);
            }

            this.closedWindowIds[windowId] = true;
            clearTimeout(this.sessionUpdateTimers[windowId]);
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
                this.sessions.some((curSession, index) => {
                    if (curSession.windowId === windowId) {
                        this.sessions.splice(index, 1);
                        return true;
                    }
                    return false;
                });
            }
        }

        callback();
    }

    async handleWindowFocussed(windowId) {
        await this.ensureInitialized();
        
        if (debug) {
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
    }

    // 1sec timer-based batching system.
    // Set a timeout so that multiple tabs all opened at once (like when restoring a session)
    // only trigger this function once (as per the timeout set by the last tab event)
    // This will cause multiple triggers if time between tab openings is longer than 1 sec
    queueWindowEvent(windowId, eventId, callback) {
        clearTimeout(this.sessionUpdateTimers[windowId]);

        this.eventQueueCount += 1;

        this.sessionUpdateTimers[windowId] = setTimeout(() => {
            this.handleWindowEvent(windowId, eventId, callback);
        }, 1000);
    }

    // careful here as this function gets called A LOT
    async handleWindowEvent(windowId, eventId, callback = noop) {
        if (debug) {
            // eslint-disable-next-line no-console
            console.log('------------------------------------------------');

            // eslint-disable-next-line no-console
            console.log(
                `event: ${eventId}. attempting session update. windowId: ${windowId}`
            );
        }

        // sanity check windowId
        if (!windowId || windowId <= 0) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `received an event for windowId: ${windowId} which is obviously wrong`
                );
            }
            return;
        }

        let curWindow;
        try {
            curWindow = await chrome.windows.get(windowId, { populate: true });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(
                `${e.message}. perhaps its the development console???`
            );

            // if we can't find this window, then better remove references to it from the cached sessions
            // don't mark as a removed window however, so that the space can be resynced up if the window
            // does actually still exist (for some unknown reason)
            this.handleWindowRemoved(
                windowId,
                false
            );
            return;
        }

        if (!curWindow || this.filterInternalWindows(curWindow)) {
            return;
        }

        // don't allow event if it pertains to a closed window id
        if (this.closedWindowIds[windowId]) {
            if (debug) {
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
            if (debug) {
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
            const historyItems = this.historyQueue.filter(
                historyItem => {
                    return historyItem.windowId === windowId;
                }
            );

            for (let i = historyItems.length - 1; i >= 0; i -= 1) {
                const historyItem = historyItems[i];

                if (historyItem.action === 'add') {
                    this.addUrlToSessionHistory(
                        session,
                        historyItem.url
                    );
                } else if (historyItem.action === 'remove') {
                    this.removeUrlFromSessionHistory(
                        session,
                        historyItem.url
                    );
                }
                this.historyQueue.splice(i, 1);
            }

            // override session tabs with tabs from window
            session.tabs = curWindow.tabs;
            session.sessionHash = generateSessionHash(
                session.tabs
            );

            // if it is a saved session then update db
            if (session.id) {
                await this.saveExistingSession(session);
            }
        }

        // if no session found, it must be a new window.
        // if session found without session.id then it must be a temporary session
        // check for sessionMatch
        if (!session || !session.id) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log('session check triggered');
            }
            this.checkForSessionMatch(curWindow);
        }
        callback();
    }

    // PUBLIC FUNCTIONS

    addUrlToSessionHistory(session, newUrl) {
        if (debug) {
            // eslint-disable-next-line no-console
            console.log(`adding tab to history: ${newUrl}`);
        }

        const cleanUrlResult = cleanUrl(newUrl);

        if (cleanUrlResult.length === 0) {
            return false;
        }

        // don't add removed tab to history if there is still a tab open with same url
        // note: assumes tab has NOT already been removed from session.tabs
        const tabBeingRemoved = session.tabs.filter(curTab => {
            return cleanUrl(curTab.url) === cleanUrlResult;
        });

        if (tabBeingRemoved.length !== 1) {
            return false;
        }

        // eslint-disable-next-line no-param-reassign
        if (!session.history) session.history = [];

        // see if tab already exists in history. if so then remove it (it will be re-added)
        session.history.some((historyTab, index) => {
            if (cleanUrl(historyTab.url) === cleanUrlResult) {
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
    }

    removeUrlFromSessionHistory(session, newUrl) {
        if (debug) {
            // eslint-disable-next-line no-console
            console.log(`removing tab from history: ${newUrl}`);
        }

        // eslint-disable-next-line no-param-reassign
        newUrl = cleanUrl(newUrl);

        if (newUrl.length === 0) {
            return;
        }

        // see if tab already exists in history. if so then remove it
        session.history.some((historyTab, index) => {
            if (cleanUrl(historyTab.url) === newUrl) {
                session.history.splice(index, 1);
                return true;
            }
            return false;
        });
    }

    // Database actions

    async updateSessionTabs(sessionId, tabs, callback = noop) {
        const session = await dbService.fetchSessionById(sessionId);

        // update tabs in session
        session.tabs = tabs;
        session.sessionHash = generateSessionHash(session.tabs);

        const result = await this.saveExistingSession(session);
        callback(result);
    }

    async updateSessionName(sessionId, sessionName, callback = noop) {
        const session = await dbService.fetchSessionById(sessionId);
        session.name = sessionName;

        await this.saveExistingSession(session);
        callback();
    }

    /**
     * Updates an existing session in the database.
     * 
     * @param {Session} session - The session object to update
     * @returns {Promise<Session|null>} Promise that resolves to:
     *   - Updated session object if successfully saved
     *   - null if session update failed
     */
    async saveExistingSession(session) {
        try {
            const updatedSession = await dbService.updateSession(session);
            return updatedSession || null;
        } catch (error) {
            console.error('Error saving existing session:', error);
            return null;
        }
    }

    /**
     * Creates a new session with the provided name, tabs, and window association.
     * If a temporary session exists for the given windowId, it will be converted to a permanent session.
     * Otherwise, a new session is created and added to the sessions cache.
     * 
     * @param {string} sessionName - The name for the new session
     * @param {Array<Object>} tabs - Array of tab objects containing URL and other tab properties
     * @param {number|false} windowId - The window ID to associate with this session, or false for no association
     * @returns {Promise<Session|null>} Promise that resolves to:
     *   - Session object with id property if successfully created
     *   - null if session creation failed or no tabs were provided
     */
    async saveNewSession(sessionName, tabs, windowId) {
        await this.ensureInitialized();
        
        if (!tabs) {
            return null;
        }

        const sessionHash = generateSessionHash(tabs);
        let session;

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
            this.sessions.push(session);
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
                return savedSession;
            } else {
                console.error('Failed to create session');
                return null;
            }
        } catch (error) {
            console.error('Error creating session:', error);
            return null;
        }
    }

    async deleteSession(sessionId, callback = noop) {
        try {
            const success = await dbService.removeSession(sessionId);
            if (success) {
                // remove session from cached array
                this.sessions.some((session, index) => {
                    if (session.id === sessionId) {
                        this.sessions.splice(index, 1);
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
    }
}

// Module-level helper functions.

/**
 * Cleans and normalizes a URL by removing query parameters, fragments, and filtering out
 * internal Chrome extension URLs and new tab pages. Also handles special cases like
 * 'The Great Suspender' extension URLs.
 * 
 * NOTE: if ever changing this function, then we'll need to update all
 * saved sessionHashes so that they match next time, using: resetAllSessionHashes()
 * 
 * @param {string} url - The URL to clean and normalize
 * @returns {string} The cleaned URL, or empty string if URL should be ignored
 * 
 * @example
 * cleanUrl('https://example.com/page?param=value#section') // returns 'https://example.com/page'
 * cleanUrl('chrome://newtab/') // returns ''
 * cleanUrl('chrome-extension://abc123/page.html') // returns ''
 */
function cleanUrl(url) {
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

    let processedUrl = url;

    // add support for 'The Great Suspender'
    if (
        processedUrl.indexOf('suspended.html') > 0 &&
        processedUrl.indexOf('uri=') > 0
    ) {
        processedUrl = processedUrl.substring(
            processedUrl.indexOf('uri=') + 4,
            processedUrl.length
        );
    }

    // remove any text after a '#' symbol
    if (processedUrl.indexOf('#') > 0) {
        processedUrl = processedUrl.substring(0, processedUrl.indexOf('#'));
    }

    // remove any text after a '?' symbol
    if (processedUrl.indexOf('?') > 0) {
        processedUrl = processedUrl.substring(0, processedUrl.indexOf('?'));
    }

    return processedUrl;
}

/**
 * Generates a unique hash for a browser session based on the URLs of its tabs.
 * This hash is used to match existing sessions when windows are reopened after Chrome restart.
 * The hash is created by concatenating all cleaned tab URLs and applying a 32-bit hash algorithm.
 * 
 * @param {Array<Object>} tabs - Array of tab objects, each containing a 'url' property
 * @returns {number} A positive 32-bit integer hash representing the session
 * 
 * @example
 * const tabs = [
 *   { url: 'https://example.com' },
 *   { url: 'https://google.com' }
 * ];
 * generateSessionHash(tabs) // returns something like 1234567890
 */
function generateSessionHash(tabs) {
    const text = tabs.reduce((prevStr, tab) => {
        return prevStr + cleanUrl(tab.url);
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
}

// Export an instance of the SpacesService class
export const spacesService = new SpacesService();
