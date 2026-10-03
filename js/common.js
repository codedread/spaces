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
 * https://developer.chrome.com/docs/extensions/reference/api/tabs/#type-Tab
 * @typedef Tab
 * @property {string} favIconUrl The URL of the tab's favicon.
 * @property {string} title The title of the tab.
 * @property {string} url The URL of the tab.
 */

/**
 * https://developer.chrome.com/docs/extensions/reference/api/windows/#type-Window
 * @typedef Window
 * @property {Array<Tab>} tabs The tabs in the window.
 */

/**
 * @typedef Space
 * @property {number|false} sessionId The unique identifier for the session, or false if not saved.
 * @property {number|false} windowId The ID of the window associated with the space, or false if not open.
 * @property {string|false} name The name of the space, or false if not named.
 * @property {Array<Tab>} tabs Array of tab objects containing URL and other tab properties.
 * @property {Array<Object>|false} history Array of tab history objects, or false if no history.
 */

/**
 * @typedef SessionPresence
 * @property {boolean} exists A session with this name exists in the database.
 * @property {boolean} isOpen The session is currently open in a window.
 * @property {string|false} sessionName The name of the session, or false if not named.
 */

/**
 * The result of asking the background to open a space (or a tab within a space).
 * @typedef LoadSpaceResult
 * @property {boolean} success True if the space was opened or focused.
 * @property {string} [error] Why the space could not be opened, if success is false.
 */

/**
 * Returns true if the URL points at a local file (file: scheme). Chrome does not let
 * Spaces open these, so they cannot be restored when a space is reopened.
 * @param {string} url
 * @returns {boolean}
 */
export function isFileUrl(url) {
    return typeof url === 'string' && url.toLowerCase().startsWith('file:');
}

/**
 * Escapes HTML characters. A copy of utils.js's escapeHtml, which is client-side only.
 * @param {string} text
 * @returns {string}
 */
function escapeHtmlText(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Turns a file: URL into a data: URL for a small HTML page explaining that Spaces cannot
 * open it. Any other URL is returned unchanged, so this is safe to call more than once.
 * @param {string} url
 * @returns {string}
 *
 * @example
 * toFileUrlPlaceholder('https://example.com') // returns 'https://example.com'
 * toFileUrlPlaceholder('file:///home/me/doc.pdf') // returns 'data:text/html;charset=utf-8,...'
 */
export function toFileUrlPlaceholder(url) {
    if (!isFileUrl(url)) {
        return url;
    }

    let fileName = url;
    try {
        const path = url.split(/[?#]/)[0];
        fileName = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1)) || url;
    } catch (e) {
        // Malformed escape sequence; fall back to the full URL.
    }

    const safeUrl = escapeHtmlText(url);
    const html = '<!doctype html><meta charset="utf-8">'
        + `<title>${escapeHtmlText(fileName)}</title>`
        + '<body style="font-family:sans-serif;margin:2em;line-height:1.5">'
        + `<h1 style="font-size:1.25em">Spaces Cannot Open Local Files</h1>`
        + '<p>The Spaces extension cannot open local file '
        + `<code style="user-select:all;word-break:break-all">${safeUrl}</code></p>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * Returns a copy of the tabs with every file: URL replaced by a placeholder page
 * (see toFileUrlPlaceholder). The input array and its tabs are not modified.
 * @param {Array<Tab>|false|undefined} tabs
 * @returns {Array<Tab>|false|undefined} The new tabs, or the input unchanged if it is
 *     not an array or has no file: URLs.
 */
export function replaceFileUrls(tabs) {
    if (!Array.isArray(tabs) || !tabs.some(tab => tab && isFileUrl(tab.url))) {
        return tabs;
    }

    return tabs.map(tab => {
        if (!tab || !isFileUrl(tab.url)) {
            return tab;
        }
        const { favIconUrl, ...rest } = tab;
        return { ...rest, url: toFileUrlPlaceholder(tab.url) };
    });
}

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
