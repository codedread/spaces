/*
 * common.js
 * Licensed under the MIT License
 * Copyright (C) 2025 by the Contributors.
 */

/** Common types shared between background and client code. */

// TODO(codedread): Fill out the rest of the properties.
/**
 * @typedef Space
 * @property {string} id The unique identifier for the space.
 * @property {string} name The name of the space.
 * @property {string?} windowId The ID of the window associated with the space, if any.
 */

/**
 * @typedef SessionPresence
 * @property {boolean} exists A session with this name exists in the database.
 * @property {boolean} isOpen The session is currently open in a window.
 */
