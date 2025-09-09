/**
 * @fileoverview Shared utilities and types for the Spaces Chrome extension.
 * 
 * This module contains functions and type definitions that are used by both
 * client-side code (popup, spaces window, etc.) and background scripts.
 * Client-side only utilities should be placed in utils.js instead.
 * 
 * Licensed under the MIT License
 * Copyright (C) 2025 by the Contributors.
 */

/**
 * @typedef Space
 * @property {number|false} sessionId The unique identifier for the session, or false if not saved.
 * @property {number|false} windowId The ID of the window associated with the space, or false if not open.
 * @property {string|false} name The name of the space, or false if not named.
 * @property {Array<Object>} tabs Array of tab objects containing URL and other tab properties.
 * @property {Array<Object>|false} history Array of tab history objects, or false if no history.
 */

/**
 * @typedef SessionPresence
 * @property {boolean} exists A session with this name exists in the database.
 * @property {boolean} isOpen The session is currently open in a window.
 */

/**
 * Extracts a parameter value from a URL's hash fragment.
 * @param {string} key - The parameter name to extract
 * @param {string} urlStr - The URL string to parse
 * @returns {string|false} The parameter value, or false if not found
 * 
 * @example
 * getHashVariable('id', 'https://example.com#id=123&name=test')
 * // returns: '123'
 */
export function getHashVariable(key, urlStr) {
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
}
