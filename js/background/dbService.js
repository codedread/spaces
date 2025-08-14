/* global db */

import { db } from './db.js';

// eslint-disable-next-line no-var
export var dbService = {
    DB_SERVER: 'spaces',
    DB_VERSION: '1',
    DB_SESSIONS: 'ttSessions',

    noop() {},

    /**
     * Opens and returns a database connection.
     * @returns {Promise} Promise that resolves to database connection
     */
    getDb() {
        return db.open({
            server: dbService.DB_SERVER,
            version: dbService.DB_VERSION,
            schema: dbService.getSchema,
        });
    },

    /**
     * Properties of a session object
     * session.id:           auto-generated indexedDb object id
     * session.sessionHash:  a hash formed from the combined urls in the session window
     * session.name:         the saved name of the session
     * session.tabs:         an array of chrome tab objects (often taken from the chrome window obj)
     * session.history:      an array of chrome tab objects that have been removed from the session
     * session.lastAccess:   timestamp that gets updated with every window focus
     */
    /**
     * Returns database schema definition.
     * @returns {Object} Database schema configuration object
     */
    getSchema() {
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
    },

    /**
     * Fetches all sessions from the database.
     * @returns {Promise<Array>} Promise that resolves to array of session objects
     */
    _fetchAllSessions() {
        return dbService.getDb().then(s => {
            return s
                .query(dbService.DB_SESSIONS)
                .all()
                .execute();
        });
    },

    /**
     * Fetches a session by ID from the database.
     * @param {number} id - The session ID to fetch
     * @returns {Promise<Object|null>} Promise that resolves to session object or null if not found
     */
    _fetchSessionById(id) {
        return dbService.getDb().then(s => {
            return s
                .query(dbService.DB_SESSIONS, 'id')
                .only(id)
                .distinct()
                .desc()
                .execute()
                .then(results => {
                    return results.length > 0 ? results[0] : null;
                });
        });
    },

    /**
     * Fetches all sessions from the database.
     * @returns {Promise<Array>} Promise that resolves to array of session objects
     */
    async fetchAllSessions() {
        try {
            const sessions = await dbService._fetchAllSessions();
            return sessions;
        } catch (error) {
            console.error('Error fetching all sessions:', error);
            return [];
        }
    },

    /**
     * Fetches a session by ID.
     * @param {string|number} id - The session ID to fetch
     * @returns {Promise<Object|null>} Promise that resolves to session object or null if not found
     */
    async fetchSessionById(id) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;
        try {
            const session = await dbService._fetchSessionById(_id);
            return session;
        } catch (error) {
            console.error('Error fetching session by ID:', error);
            return null;
        }
    },

    /**
     * Fetches all session names.
     * @returns {Promise<Array<string>>} Promise that resolves to array of session names
     */
    async fetchSessionNames() {
        try {
            const sessions = await dbService._fetchAllSessions();
            return sessions.map(session => session.name);
        } catch (error) {
            console.error('Error fetching session names:', error);
            return [];
        }
    },

    /**
     * Fetches a session by name.
     * @param {string} sessionName - The session name to search for
     * @returns {Promise<Object|false>} Promise that resolves to session object or false if not found
     */
    async fetchSessionByName(sessionName) {
        try {
            const sessions = await dbService._fetchAllSessions();
            let matchIndex;
            const matchFound = sessions.some((session, index) => {
                if (session.name.toLowerCase() === sessionName.toLowerCase()) {
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
    },

    /**
     * Creates a new session in the database.
     * @param {Object} session - The session object to create (id will be auto-generated)
     * @returns {Promise<Object|null>} Promise that resolves to created session with ID or null if failed
     */
    async createSession(session) {
        // delete session id in case it already exists
        const { id, ..._session } = session;

        try {
            const s = await dbService.getDb();
            const result = await s.add(dbService.DB_SESSIONS, _session);
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            console.error('Error creating session:', error);
            return null;
        }
    },

    /**
     * Updates an existing session in the database.
     * @param {Object} session - The session object to update (must have valid id)
     * @returns {Promise<Object|null>} Promise that resolves to updated session or null if failed
     */
    async updateSession(session) {
        // ensure session id is set
        if (!session.id) {
            return null;
        }

        try {
            const s = await dbService.getDb();
            const result = await s.update(dbService.DB_SESSIONS, session);
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            console.error('Error updating session:', error);
            return null;
        }
    },

    /**
     * Removes a session from the database.
     * @param {string|number} id - The session ID to remove
     * @returns {Promise<boolean>} Promise that resolves to true if successful, false if failed
     */
    async removeSession(id) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;

        try {
            const s = await dbService.getDb();
            await s.remove(dbService.DB_SESSIONS, _id);
            return true;
        } catch (error) {
            console.error('Error removing session:', error);
            return false;
        }
    },
};
