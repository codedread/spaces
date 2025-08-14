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
     * @param {string} id - The session ID to fetch
     * @returns {Promise<Object|null>} Promise that resolves to session object or null if not found
     */
    _fetchSessionById(id) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;
        return dbService.getDb().then(s => {
            return s
                .query(dbService.DB_SESSIONS, 'id')
                .only(_id)
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
     * Fetches a session by ID and calls callback with result.
     * @param {string} id - The session ID to fetch
     * @param {Function} callback - Callback function that receives session object or null
     */
    fetchSessionById(id, callback) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;
        const _callback =
            typeof callback !== 'function' ? dbService.noop : callback;
        dbService._fetchSessionById(_id).then(session => {
            _callback(session);
        });
    },

    /**
     * Fetches all session names and calls callback with results.
     * @param {Function} callback - Callback function that receives array of session names
     */
    fetchSessionNames(callback) {
        const _callback =
            typeof callback !== 'function' ? dbService.noop : callback;

        dbService._fetchAllSessions().then(sessions => {
            _callback(
                sessions.map(session => {
                    return session.name;
                })
            );
        });
    },

    /**
     * Fetches a session by name and calls callback with result.
     * @param {string} sessionName - The session name to search for
     * @param {Function} callback - Callback function that receives session object or false if not found
     */
    fetchSessionByName(sessionName, callback) {
        const _callback =
            typeof callback !== 'function' ? dbService.noop : callback;

        dbService._fetchAllSessions().then(sessions => {
            let matchIndex;
            const matchFound = sessions.some((session, index) => {
                if (session.name.toLowerCase() === sessionName.toLowerCase()) {
                    matchIndex = index;
                    return true;
                }
                return false;
            });

            if (matchFound) {
                _callback(sessions[matchIndex]);
            } else {
                _callback(false);
            }
        });
    },

    /**
     * Creates a new session in the database.
     * @param {Object} session - The session object to create (id will be auto-generated)
     * @param {Function} callback - Callback function that receives the created session with ID
     */
    createSession(session, callback) {
        const _callback =
            typeof callback !== 'function' ? dbService.noop : callback;

        // delete session id in case it already exists
        const { id, ..._session } = session;

        dbService
            .getDb()
            .then(s => {
                return s.add(dbService.DB_SESSIONS, _session);
            })
            .then(result => {
                if (result.length > 0) {
                    _callback(result[0]);
                }
            });
    },

    /**
     * Updates an existing session in the database.
     * @param {Object} session - The session object to update (must have valid id)
     * @param {Function} callback - Callback function that receives the updated session or false if failed
     */
    updateSession(session, callback) {
        const _callback =
            typeof callback !== 'function' ? dbService.noop : callback;

        // ensure session id is set
        if (!session.id) {
            _callback(false);
            return;
        }

        dbService
            .getDb()
            .then(s => {
                return s.update(dbService.DB_SESSIONS, session);
            })
            .then(result => {
                if (result.length > 0) {
                    _callback(result[0]);
                }
            });
    },

    /**
     * Removes a session from the database.
     * @param {string} id - The session ID to remove
     * @param {Function} callback - Callback function called when removal is complete
     */
    removeSession(id, callback) {
        const _id = typeof id === 'string' ? parseInt(id, 10) : id;
        const _callback =
            typeof callback !== 'function' ? dbService.noop : callback;

        dbService
            .getDb()
            .then(s => {
                return s.remove(dbService.DB_SESSIONS, _id);
            })
            .then(_callback);
    },
};
