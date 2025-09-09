/**
 * @fileoverview Client-side utility functions for the Spaces Chrome extension.
 * 
 * This module contains utility functions that are only used by client-side code
 * (popup, spaces window, content scripts, etc.). Functions that need to be shared
 * between client-side and background scripts should be placed in common.js instead.
 */

/* global chrome  */

/** @typedef {import('./common.js').SessionPresence} SessionPresence */

/**
 * Checks if a session with the given name can be overwritten by checking
 * with the background script, alerting the user if the session is currently
 * open, and confirming if the session already exists but is not open.
 * @param {string} sessionName 
 * @returns {Promise<boolean>} Returns true if the session can be safely
 *     overwritten. This happens if the session does not exist or if the
 *     user has confirmed overwriting.
 */
export async function checkSessionOverwrite(sessionName) {
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
}

/**
 * Escapes HTML characters to prevent XSS and HTML injection.
 * @param {string} text - The text to escape
 * @returns {string} The HTML-escaped text
 */
export function escapeHtml(text) {
    if (!text) return text;
    
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
