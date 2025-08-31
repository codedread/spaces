/*
 * common.js
 * Licensed under the MIT License
 * Copyright (C) 2025 by the Contributors.
 */

/** Common types shared between background and client code. */

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

export {}
