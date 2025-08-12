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

    getHashVariable(key, urlStr) {
        const valuesByKey = {};
        const keyPairRegEx = /^(.+)=(.+)/;

        if (!urlStr || urlStr.length === 0 || urlStr.indexOf('#') === -1) {
            return false;
        }

        // extract hash component from url
        const hashStr = urlStr.replace(/^[^#]+#+(.*)/, '$1');
        if (hashStr.length === 0) {
            return false;
        }

        hashStr.split('&').forEach(keyPair => {
            if (keyPair && keyPair.match(keyPairRegEx)) {
                valuesByKey[
                    keyPair.replace(keyPairRegEx, '$1')
                ] = keyPair.replace(keyPairRegEx, '$2');
            }
        });
        return valuesByKey[key] || false;
    },

    async getSwitchKeycodes(callback) {
            const commands = await chrome.commands.getAll();
            // eslint-disable-next-line no-console
            console.dir(commands);

            const commandStr = commands.switchCode;

            const keyStrArray = commandStr.split('+');

            // get keyStr of primary modifier
            const primaryModifier = keyStrArray[0];

            // get keyStr of secondary modifier
            const secondaryModifier =
                keyStrArray.length === 3 ? keyStrArray[1] : false;

            // get keycode of main key (last in array)
            const curStr = keyStrArray[keyStrArray.length - 1];

            // TODO: There's others. Period. Up Arrow etc.
            let mainKeyCode;
            if (curStr === 'Space') {
                mainKeyCode = 32;
            } else {
                mainKeyCode = curStr.toUpperCase().charCodeAt();
            }

            callback({
                primaryModifier,
                secondaryModifier,
                mainKeyCode,
            });
    },
};
