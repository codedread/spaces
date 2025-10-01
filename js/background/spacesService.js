/* global chrome, dbService */

/* spaces
 * Copyright (C) 2015 Dean Oemcke
 */

/** @typedef {import('./dbService.js').Session} Session */

import { dbService, getSchema, DB_VERSION } from './dbService.js';

// Module-level properties
const debug = false;
const noop = () => {};

class SpacesService {
    /**
     * Array containing all sessions - both saved sessions from database and temporary sessions for open windows.
     * Saved sessions have an `id` property, while temporary sessions have `id: false` and represent
     * open windows that don't match any saved session.
     * @type {Array<Session>}
     * @private
     */
    sessions = [];

    constructor() {
        this.tabHistoryUrlMap = {};
        this.closedWindowIds = {};
        this.boundsUpdateTimers = {};
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
                if (!filterInternalWindows(curWindow)) {
                    await this._checkForSessionMatchDuringInit(curWindow);
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
                    // Persist the cleared windowId to database and update memory
                    await this._updateSessionSync(session);
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
            await this._updateSessionSync(session);
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

    /**
     * Checks for session matches during initialization, handling both service worker reactivation
     * and Chrome restart scenarios. First checks for existing sessions by windowId, then falls
     * back to hash matching if none found.
     * 
     * @private
     * @param {chrome.windows.Window} curWindow - Chrome window object with tabs array
     * @returns {Promise<void>} Resolves when initialization matching completes
     */
    async _checkForSessionMatchDuringInit(curWindow) {
        if (!curWindow.tabs || curWindow.tabs.length === 0) {
            return;
        }

        // First, check if there's already a session with this windowId (service worker reactivation case)
        let existingSession = null;
        try {
            existingSession = await this._getSessionByWindowIdInternal(curWindow.id);
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
        await this._ensureWindowHasSession(curWindow);
    }

    /**
     * Ensures a window has an associated session using multiple strategies:
     * 1. Checks for existing session by windowId (returns early if found)
     * 2. Attempts hash-based matching with saved sessions (links if match found)
     * 3. Creates temporary session as fallback (if no existing session or match)
     * 
     * @private
     * @param {chrome.windows.Window} curWindow - Chrome window object with tabs array
     * @returns {Promise<void>} Resolves when session association is complete
     */
    async _ensureWindowHasSession(curWindow) {
        if (!curWindow.tabs || curWindow.tabs.length === 0) {
            return;
        }

        // Double-check that a session doesn't already exist for this window
        // This is an additional safety check to prevent race conditions
        const existingSession = this.sessions.find(session => session.windowId === curWindow.id);
        if (existingSession) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `ensureWindowHasSession: Session already exists for window ${curWindow.id}, skipping creation`
                );
            }
            return;
        }

        // Generate hash from current window's tabs to find matching saved sessions
        const sessionHash = generateSessionHash(curWindow.tabs);
        
        // Find matching session by hash (closedOnly = true - sessions with no windowId)
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
        } else {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `no matching session found. creating temporary session for window: ${curWindow.id}`
                );
            }

            // create a new temporary session for this window (with no sessionId or name)
            this._createTemporaryUnmatchedSession(curWindow);
        }
    }

    async matchSessionToWindow(session, curWindow) {
        await this.ensureInitialized();
        
        // remove any other sessions tied to this windowId (temporary sessions)
        for (let i = this.sessions.length - 1; i >= 0; i -= 1) {
            if (this.sessions[i].windowId === curWindow.id) {
                if (this.sessions[i].id) {
                    this.sessions[i].windowId = false;
                    // Persist the cleared windowId to database with sync
                    await this._updateSessionSync(this.sessions[i]);
                } else {
                    this.sessions.splice(i, 1);
                }
            }
        }

        // assign windowId to newly matched session
        // eslint-disable-next-line no-param-reassign
        session.windowId = curWindow.id;
        
        // Persist the new windowId association to database with automatic sync
        if (session.id) {
            await this._updateSessionSync(session);
        }
    }

    /**
     * Safely adds a session to this.sessions array, preventing duplicates.
     * For saved sessions (with id), prevents duplicates by id.
     * For any session with windowId, prevents duplicates by windowId.
     * 
     * @private
     * @param {Session} newSession - The session to add
     * @returns {boolean} True if session was added, false if duplicate was prevented
     */
    _addSessionSafely(newSession) {
        // For saved sessions (with id), check for ID duplicates
        if (newSession.id) {
            const existingSession = this.sessions.find(session => session.id === newSession.id);
            if (existingSession) {
                console.error(
                    `_addSessionSafely: Attempted to add duplicate session with id ${newSession.id}. This should not happen!`
                );
                return false;
            }
        }
        
        // For any session with windowId, check for windowId duplicates
        if (newSession.windowId) {
            const existingSession = this.sessions.find(session => session.windowId === newSession.windowId);
            if (existingSession) {
                if (debug) {
                    // eslint-disable-next-line no-console
                    console.log(
                        `_addSessionSafely: Session already exists for window ${newSession.windowId}, skipping addition`
                    );
                }
                return false;
            }
        }
        
        // Safe to add - no duplicate found
        this.sessions.push(newSession);
        return true;
    }

    /**
     * Creates a temporary session for an unmatched window that doesn't correspond to any saved session.
     * Temporary sessions have `id: false` and represent open windows that haven't been saved as sessions yet.
     * Uses centralized duplicate prevention to ensure no duplicate sessions are created for the same windowId.
     * 
     * @private
     * @param {chrome.windows.Window} curWindow - The Chrome window object to create a temporary session for
     * @returns {boolean} True if the temporary session was successfully created, false if duplicate was prevented
     * 
     * @example
     * // Internal usage only
     * const window = { id: 123, tabs: [{ url: 'https://example.com' }] };
     * const created = this._createTemporaryUnmatchedSession(window);
     * console.log(created); // true if session created, false if duplicate prevented
     */
    _createTemporaryUnmatchedSession(curWindow) {
        if (debug) {
            // eslint-disable-next-line no-console
            console.dir(this.sessions);
            // eslint-disable-next-line no-console
            console.dir(curWindow);
            // eslint-disable-next-line no-alert
            // alert('couldnt match window. creating temporary session');
        }

        const sessionHash = generateSessionHash(curWindow.tabs);

        const newSession = {
            id: false,
            windowId: curWindow.id,
            sessionHash,
            name: false,
            tabs: curWindow.tabs,
            history: [],
            lastAccess: new Date(),
        };

        // Use centralized method to prevent duplicates
        return this._addSessionSafely(newSession);
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

    /**
     * Get all sessions (includes both saved sessions and temporary open window sessions)
     * @returns {Promise<Array<Session>>} Promise that resolves to a shallow copy of all sessions
     */
    async getAllSessions() {
        await this.ensureInitialized();
        return [...(this.sessions || [])];
    }

    /**
     * Exports the entire database for debugging purposes with anonymized data.
     * @returns {Promise<Object>} Promise that resolves to an object containing:
     *   - version: database version
     *   - schema: database schema
     *   - sessions: anonymized session data
     */
    async exportDatabaseForDebugging() {
        await this.ensureInitialized();

        const anonymizedSessions = (await dbService.fetchAllSessions()).map((session, index) => {
            const anonymizedSession = { ...session };
            if (session.name) anonymizedSession.name = `Space_${index + 1}`;
            if (session.tabs && Array.isArray(session.tabs)) {
                anonymizedSession.tabs = session.tabs.map((tab, tabIndex) => 
                    this._anonymizeTab(tab, tabIndex + 1, 'Tab')
                );
            }
            if (session.history && Array.isArray(session.history)) {
                anonymizedSession.history = session.history.map((historyTab, historyIndex) => 
                    this._anonymizeTab(historyTab, historyIndex + 1, 'History Tab')
                );
            }
            return anonymizedSession;
        });

        return {
            version: {
                database: DB_VERSION,
                extension: await this.fetchLastVersion(),
                manifest: chrome.runtime.getManifest().version
            },
            schema: getSchema(),
            sessions: anonymizedSessions,
        };
    }

    /**
     * Anonymizes a tab object for debugging export
     * @private
     * @param {Object} tab - The tab object to anonymize
     * @param {number} index - The index number for generating unique placeholder values
     * @param {string} prefix - The prefix for the title (e.g., 'Tab' or 'History Tab')
     * @returns {Object} Anonymized tab object
     */
    _anonymizeTab(tab, index, prefix) {
        const anonymizedTab = { ...tab };
        if (tab.url) anonymizedTab.url = `https://example-${index}.com/path`;
        if (tab.title) anonymizedTab.title = `${prefix} ${index}`;
        if (tab.favIconUrl) anonymizedTab.favIconUrl = 'data:anonymized-favicon';
        return anonymizedTab;
    }

    /**
     * Find a session by windowId, checking both in-memory sessions and database
     * @param {number} windowId - The window ID to search for
     * @returns {Session|null} The session object if found, null otherwise
     */
    async getSessionByWindowId(windowId) {
        await this.ensureInitialized();
        return await this._getSessionByWindowIdInternal(windowId);
    }

    /**
     * Internal method to find a session by windowId without ensuring initialization
     * Used during initialization to avoid circular dependencies
     * @private
     * @param {number} windowId - The window ID to search for
     * @returns {Promise<Session|null>} The session object if found, null otherwise
     */
    async _getSessionByWindowIdInternal(windowId) {
        // First check in-memory sessions (includes temporary sessions)
        const memorySession = this.sessions.find(session => session.windowId === windowId);
        if (memorySession) {
            return memorySession;
        }
        
        // If not found in memory, check database (for saved sessions)
        // During initialization, avoid potential circular dependencies
        if (this.initialized) {
            const dbSession = await dbService.fetchSessionByWindowId(windowId);
            return dbSession || null;
        }
        
        // During initialization, only check what's already loaded in memory
        return null;
    }

    /**
     * Captures and stores window bounds for a window with debouncing.
     * This is called when window bounds change to ensure we have current bounds
     * without excessive database writes during rapid resize/move operations.
     *
     * @param {number} windowId - The ID of the window to capture bounds for
     * @param {Object} bounds - The window bounds object with left, top, width, height
     * @returns {Promise<void>}
     */
    async captureWindowBounds(windowId, bounds) {
        await this.ensureInitialized();
        
        const session = await this.getSessionByWindowId(windowId);
        if (session && session.id) {
            // Update bounds in memory immediately for responsiveness
            session.windowBounds = {
                left: bounds.left,
                top: bounds.top, 
                width: bounds.width,
                height: bounds.height
            };
            
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(`Captured window bounds for session ${session.id}:`, session.windowBounds);
            }

            // Debounce database writes to avoid excessive I/O during rapid resize/move
            clearTimeout(this.boundsUpdateTimers[windowId]);
            this.boundsUpdateTimers[windowId] = setTimeout(async () => {
                try {
                    // Save bounds to database after debounce period
                    await this._updateSessionSync(session);
                    if (debug) {
                        // eslint-disable-next-line no-console
                        console.log(`Saved window bounds to database for session ${session.id}`);
                    }
                } catch (error) {
                    console.error(`Error saving bounds for session ${session.id}:`, error);
                }
            }, 1000); // 1 second debounce - adjust as needed
        }
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

    /**
     * Handles window removal events by cleaning up session data and managing window state.
     * Updates session associations and removes temporary sessions when windows are closed.
     * 
     * @param {number} windowId - The ID of the window that was removed
     * @param {boolean} markAsClosed - Whether to mark this window as permanently closed
     * @returns {Promise<boolean>} Promise that resolves to:
     *   - true if the window removal was successfully processed
     *   - false if the removal was ignored (duplicate event for same windowId)
     */
    async handleWindowRemoved(windowId, markAsClosed) {
        await this.ensureInitialized();
        
        // ignore subsequent windowRemoved events for the same windowId (each closing tab will try to call this)
        if (this.closedWindowIds[windowId]) {
            return true;
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
            clearTimeout(this.boundsUpdateTimers[windowId]);
            clearTimeout(this.sessionUpdateTimers[windowId]);
        }

        const session = await this.getSessionByWindowId(windowId);
        if (session) {
            // if this is a saved session then just remove the windowId reference
            if (session.id) {
                session.windowId = false;
                // Persist the window to database with sync
                await this._updateSessionSync(session);

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

        return true;
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

        const session = await this.getSessionByWindowId(windowId);
        if (session) {
            session.lastAccess = new Date();
        }
    }

    // 1sec timer-based batching system.
    // Set a timeout so that multiple tabs all opened at once (like when restoring a session)
    // only trigger this function once (as per the timeout set by the last tab event)
    // This will cause multiple triggers if time between tab openings is longer than 1 sec
    queueWindowEvent(windowId, eventId, callback = noop) {
        clearTimeout(this.sessionUpdateTimers[windowId]);

        this.eventQueueCount += 1;

        this.sessionUpdateTimers[windowId] = setTimeout(async () => {
            const shouldCallback = await this.handleWindowEvent(windowId, eventId);
            if (shouldCallback) callback();
        }, 1000);
    }

    /**
     * Handles window events by updating session data when tabs change within a window.
     * This function processes batched tab events and updates the corresponding session
     * in the database.
     * 
     * NOTE: Careful here as this function gets called A LOT
     * 
     * @param {number} windowId - The ID of the window that triggered the event
     * @param {number} eventId - The unique event identifier for tracking/debugging purposes
     * @returns {Promise<boolean>} Promise that resolves to:
     *   - true if the window event was successfully processed
     *   - false if the event was ignored (invalid window, internal window, closed window, etc.)
     */
    async handleWindowEvent(windowId, eventId) {
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
            return false;
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
            return false;
        }

        if (!curWindow || filterInternalWindows(curWindow)) {
            return false;
        }

        // don't allow event if it pertains to a closed window id
        if (this.closedWindowIds[windowId]) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log(
                    `ignoring event as it pertains to a closed windowId: ${windowId}`
                );
            }
            return false;
        }

        // if window is associated with an open session then update session
        const session = await this.getSessionByWindowId(windowId);

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
            session.sessionHash = generateSessionHash(session.tabs);

            // if it is a saved session then update db
            if (session.id) {
                await this.saveExistingSession(session);
            }
        }

        // if no session found, it must be a new window - ensure it has a session
        // Note: if session found without session.id, it's a temporary session and we should NOT
        // call _ensureWindowHasSession as that would create duplicate temporary sessions
        if (!session) {
            if (debug) {
                // eslint-disable-next-line no-console
                console.log('session check triggered');
            }
            this._ensureWindowHasSession(curWindow);
        }
        return true;
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

    /**
     * Updates the tabs of an existing session in the database.
     * 
     * @param {number} sessionId - The ID of the session to update
     * @param {Array<Object>} tabs - Array of tab objects containing URL and other tab properties
     * @returns {Promise<Session|null>} Promise that resolves to:
     *   - Updated session object if successfully saved
     *   - null if session update failed
     */
    async updateSessionTabs(sessionId, tabs) {
        const session = await dbService.fetchSessionById(sessionId);

        // update tabs in session
        session.tabs = tabs;
        session.sessionHash = generateSessionHash(session.tabs);

        return this.saveExistingSession(session);
    }

    /**
     * Updates the name of an existing session in the database.
     * 
     * @param {number} sessionId - The ID of the session to update
     * @param {string} sessionName - The new name for the session
     * @returns {Promise<Session|null>} Promise that resolves to:
     *   - Updated session object if successfully saved
     *   - null if session update failed
     */
    async updateSessionName(sessionId, sessionName) {
        const session = await dbService.fetchSessionById(sessionId);
        session.name = sessionName;

        return this.saveExistingSession(session);
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
            const updatedSession = await this._updateSessionSync(session);
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
     * IMPORTANT: This method only works with temporary sessions (id: false). It will reject any 
     * attempt to "create" a session that already has a saved ID to prevent data corruption.
     * 
     * @param {string} sessionName - The name for the new session
     * @param {Array<Object>} tabs - Array of tab objects containing URL and other tab properties
     * @param {number|false} windowId - The window ID to associate with this session, or false for no association
     * @param {WindowBounds} [windowBounds] - Optional window bounds to save with the session
     * @returns {Promise<Session|null>} Promise that resolves to:
     *   - Session object with id property if successfully created
     *   - null if session creation failed, no tabs were provided, or attempted on already saved session
     */
    async saveNewSession(sessionName, tabs, windowId, windowBounds) {
        await this.ensureInitialized();
        
        if (!tabs) {
            return null;
        }

        const sessionHash = generateSessionHash(tabs);
        let session;

        // check for a temporary session with this windowId
        if (windowId) {
            const existingSession = await this.getSessionByWindowId(windowId);
            if (existingSession) {
                // If it's a saved session, reject immediately to prevent data corruption
                if (existingSession.id) {
                    console.error('Cannot create new session: window already has a saved session');
                    return null;
                }
                // Only use the session if it's temporary (no id)
                session = existingSession;
            }
        }

        // if no existing session found, create a new one
        if (!session) {
            session = {
                windowId,
                history: [],
            };
            // Use centralized method to prevent duplicates (protects against race conditions)
            const wasAdded = this._addSessionSafely(session);
            if (!wasAdded) {
                // Race condition: another async operation created a session for this windowId
                // Retrieve the session that was created by the other operation
                const raceConditionSession = await this.getSessionByWindowId(windowId);
                if (!raceConditionSession) {
                    console.error('Race condition detected but failed to retrieve the competing session');
                    return null;
                }
                session = raceConditionSession;
            }
        }

        // update temporary session details
        session.name = sessionName;
        session.sessionHash = sessionHash;
        session.tabs = tabs;
        session.lastAccess = new Date();
        
        // Add window bounds if provided
        if (windowBounds) {
            session.windowBounds = windowBounds;
        }

        // save session to db - this should only be called on temporary sessions (id: false)
        try {
            const savedSession = await this._createSessionSync(session);
            if (savedSession) {
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

    // ========================================
    // CENTRALIZED DATABASE OPERATIONS
    // These methods handle both database operations AND memory synchronization
    // ========================================

    /**
     * Creates a session in the database and ensures memory cache synchronization.
     * @private
     * @param {Session} session - Session object to create (must exist in this.sessions)
     * @returns {Promise<Session|null>} The created session with ID, or null if failed
     */
    async _createSessionSync(session) {
        try {
            const savedSession = await dbService.createSession(session);
            if (savedSession) {
                // Find and update the session in memory cache
                const index = this.sessions.findIndex(s => s === session);
                if (index !== -1) {
                    // Update the existing object in place to preserve references
                    // This is critical for UI components that hold references to session objects
                    Object.assign(this.sessions[index], savedSession);
                    return this.sessions[index];
                } else {
                    console.warn('Session not found in memory cache during create sync');
                    return savedSession;
                }
            }
            return null;
        } catch (error) {
            console.error('Error creating session with sync:', error);
            return null;
        }
    }

    /**
     * Updates a session in the database and ensures memory cache synchronization.
     * @private
     * @param {Session} session - Session object to update (must have valid id)
     * @returns {Promise<Session|null>} The updated session, or null if failed
     */
    async _updateSessionSync(session) {
        try {
            const updatedSession = await dbService.updateSession(session);
            if (updatedSession) {
                // Find and update the session in memory cache
                const index = this.sessions.findIndex(s => s.id === session.id);
                if (index !== -1) {
                    // Update the existing object in place to preserve references
                    // This is critical for UI components that hold references to session objects
                    Object.assign(this.sessions[index], updatedSession);
                    return this.sessions[index];
                } else {
                    console.warn('Session not found in memory cache during update sync');
                    return updatedSession;
                }
            }
            return null;
        } catch (error) {
            console.error('Error updating session with sync:', error);
            return null;
        }
    }

    /**
     * Deletes a session from the database and removes it from the cache.
     * 
     * @param {number} sessionId - The ID of the session to delete
     * @returns {Promise<boolean>} Promise that resolves to:
     *   - true if session was successfully deleted
     *   - false if session deletion failed
     */
    async deleteSession(sessionId) {
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
            return success;
        } catch (error) {
            console.error('Error deleting session:', error);
            return false;
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
 * Filters out internal Chrome extension windows that should be ignored by the Spaces extension.
 * This includes windows containing only the Spaces extension's own pages, as well as popup
 * and panel type windows.
 * 
 * @param {chrome.windows.Window} curWindow - The Chrome window object to check
 * @returns {boolean} True if the window should be filtered out (ignored), false otherwise
 * 
 * @example
 * filterInternalWindows({ tabs: [{ url: 'chrome-extension://abc123/spaces.html' }], type: 'normal' }) // returns true
 * filterInternalWindows({ tabs: [{ url: 'https://example.com' }], type: 'popup' }) // returns true  
 * filterInternalWindows({ tabs: [{ url: 'https://example.com' }], type: 'normal' }) // returns false
 */
function filterInternalWindows(curWindow) {
    // sanity check to make sure window isnt an internal spaces window
    if (
        curWindow.tabs.length === 1 &&
        curWindow.tabs[0].url.indexOf(chrome.runtime.id) >= 0
    ) {
        return true;
    }

    // Also filter out popup, panel, or pwa window types.
    if (['popup', 'panel', 'app'].includes(curWindow.type)) {
        return true;
    }
    return false;
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

// Export helper functions for testing
export { cleanUrl, filterInternalWindows, generateSessionHash };
