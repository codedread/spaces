/* global db */

import { db, Server } from './db.js';
import * as common from '../common.js';
/** @typedef {common.Tab} Tab */

/**
 * @typedef WindowBounds
 * @property {number} left The x-coordinate of the window's left edge
 * @property {number} top The y-coordinate of the window's top edge
 * @property {number} width The width of the window
 * @property {number} height The height of the window
 */

/**
 * The storage format for a space in the database.
 * @typedef Session
 * @property {number} id Auto-generated indexedDb object id
 * @property {number|false} windowId The window id associated with the session, or false.
 * @property {number} sessionHash A hash formed from the combined urls in the session window
 * @property {string} name The saved name of the session
 * @property {Array<Tab>} tabs An array of chrome tab objects (often taken from the chrome window obj)
 * @property {Array} history An array of chrome tab objects that have been removed from the session
 * @property {Date} lastAccess Timestamp that gets updated with every window focus
 * @property {WindowBounds?} windowBounds Optional saved window position and size
 */

/**
 * Returns database schema definition.
 * @returns {Object} Database schema configuration object
 */
function getSchema() {
    return {
        ttSessions: {
            key: {
                keyPath: 'id',
                autoIncrement: true,
            },
            indexes: {
                id: {},
            },
        },
    };
}

// Database constants
const DB_SERVER = 'spaces';
const DB_VERSION = '1';
const DB_SESSIONS = 'ttSessions';

class DbService {
    /**
     * Opens and returns a database connection.
     * @private
     * @returns {Promise<Server>} Promise that resolves to database connection
     */
    _getDb() {
        return db.open({
            server: DB_SERVER,
            version: DB_VERSION,
            schema: getSchema(),
        });
    }

    /**
     * Fetches all sessions from the database.
     * @private
     * @returns {Promise<Array<Session>>} Promise that resolves to array of session objects
     */
    _fetchAllSessions() {
        return this._getDb().then(s => {
            return s
                .query(DB_SESSIONS)
                .all()
                .execute();
        });
    }

    /**
     * Fetches a session by ID from the database.
     * @private
     * @param {number} id - The session ID to fetch
     * @returns {Promise<Session|null>} Promise that resolves to session object or null if not found
     */
    _fetchSessionById(id) {
        return this._getDb().then(s => {
            return s
                .query(DB_SESSIONS, 'id')
                .only(id)
                .distinct()
                .desc()
                .execute()
                .then(results => {
                    return results.length > 0 ? results[0] : null;
                });
        });
    }

    /**
     * Fetches all sessions from the database.
     * @returns {Promise<Array<Session>>} Promise that resolves to array of session objects
     */
    async fetchAllSessions() {
        try {
            const sessions = await this._fetchAllSessions();
            return sessions;
        } catch (error) {
            console.error('Error fetching all sessions:', error);
            return [];
        }
    }

    /**
     * Fetches a session by ID.
     * @param {string|number} id - The session ID to fetch
     * @returns {Promise<Session|null>} Promise that resolves to session object or null if not found
     */
    async fetchSessionById(id) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;
        try {
            const session = await this._fetchSessionById(_id);
            return session;
        } catch (error) {
            console.error('Error fetching session by ID:', error);
            return null;
        }
    }

    /**
     * Fetches all session names. Not used today.
     * @private
     * @returns {Promise<Array<string>>} Promise that resolves to array of session names
     */
    async _fetchSessionNames() {
        try {
            const sessions = await this._fetchAllSessions();
            return sessions.map(session => session.name);
        } catch (error) {
            console.error('Error fetching session names:', error);
            return [];
        }
    }

    /**
     * Fetches a session by window ID.
     * @param {number} windowId - The window ID to search for
     * @returns {Promise<Session|false>} Promise that resolves to session object or false if not found
     */
    async fetchSessionByWindowId(windowId) {
        try {
            const sessions = await this._fetchAllSessions();
            const matchedSession = sessions.find(session => session.windowId === windowId);
            return matchedSession || false;
        } catch (error) {
            console.error('Error fetching session by window ID:', error);
            return false;
        }
    }

    /**
     * Fetches a session by name.
     * @param {string} sessionName - The session name to search for
     * @returns {Promise<Session|false>} Promise that resolves to session object or false if not found
     */
    async fetchSessionByName(sessionName) {
        try {
            const sessions = await this._fetchAllSessions();
            let matchIndex;
            const matchFound = sessions.some((session, index) => {
                if (session.name?.toLowerCase() === sessionName.toLowerCase()) {
                    matchIndex = index;
                    return true;
                }
                return false;
            });

            return matchFound ? sessions[matchIndex] : false;
        } catch (error) {
            console.error('Error fetching session by name:', error);
            return false;
        }
    }

    /**
     * Creates a new session in the database.
     * @param {Session} session - The session object to create (id will be auto-generated)
     * @returns {Promise<Object|null>} Promise that resolves to created session with ID or null if failed
     */
    async createSession(session) {
        // delete session id in case it already exists
        const { id, ..._session } = session;

        try {
            const s = await this._getDb();
            const result = await s.add(DB_SESSIONS, _session);
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            console.error('Error creating session:', error);
            return null;
        }
    }

    /**
     * Updates an existing session in the database.
     * @param {Session} session - The session object to update (must have valid id)
     * @returns {Promise<Session|null>} Promise that resolves to updated session or null if failed
     */
    async updateSession(session) {
        // ensure session id is set
        if (!session.id) {
            return null;
        }

        try {
            const s = await this._getDb();
            const result = await s.update(DB_SESSIONS, session);
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            console.error('Error updating session:', error);
            return null;
        }
    }

    /**
     * Removes a session from the database.
     * @param {string|number} id - The session ID to remove
     * @returns {Promise<boolean>} Promise that resolves to true if successful, false if failed
     */
    async removeSession(id) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;

        try {
            const s = await this._getDb();
            await s.remove(DB_SESSIONS, _id);
            return true;
        } catch (error) {
            console.error('Error removing session:', error);
            return false;
        }
    }
}

// Export an instantiated object
export const dbService = new DbService();

// Export schema function and constants for debugging purposes
export { getSchema, DB_VERSION, DB_SERVER, DB_SESSIONS };
