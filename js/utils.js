/* global chrome  */

/** @typedef {import('./common.js').SessionPresence} SessionPresence */

// eslint-disable-next-line no-var, no-unused-vars
export var utils = {
    /**
     * Checks if a session with the given name can be overwritten by checking
     * with the background script, alerting the user if the session is currently
     * open, and confirming if the session already exists but is not open.
     * @param {string} sessionName 
     * @returns {Promise<boolean>} Returns true if the session can be safely
     *     overwritten. This happens if the session does not exist or if the
     *     user has confirmed overwriting.
     */
    async checkSessionOverwrite(sessionName) {
        /** @type {SessionPresence} */
        const sessionPresence = await chrome.runtime.sendMessage({
            action: 'requestSessionPresence',
            sessionName,
        });

        if (!sessionPresence.exists) {
            return true;
        }

        if (sessionPresence.isOpen) {
            // eslint-disable-next-line no-alert
            alert(
                `A session with the name '${sessionName}' is currently open and cannot be overwritten`
            );
            return false;
        }
        return confirm(
            `A session with the name '${sessionName}' already exists. Do you want to overwrite it?`
        );
    },
};
