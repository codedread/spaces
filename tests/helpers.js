/**
 * Shared test helper functions
 */
import { jest } from '@jest/globals';
import { dbService } from '../js/background/dbService.js';

// Re-export jest for convenience
export { jest };

/**
 * Sets up global Chrome API mocks for testing
 */
export const setupChromeMocks = () => {
    global.chrome = {
        runtime: {
            sendMessage: jest.fn(),
        },
        system: {
            display: {
                getInfo: jest.fn(),
            },
        },
        tabs: {
            create: jest.fn(),
            query: jest.fn(),
            update: jest.fn(),
        },
        windows: {
            getCurrent: jest.fn(),
        }
    };
};

/**
 * Sets up minimal Chrome API mocks for testing (just runtime.id)
 */
export const setupMinimalChromeMocks = () => {
    global.chrome = {
        runtime: {
            id: 'test-extension-id-12345'
        }
    };
};

/**
 * Sets up global DOM mocks for testing
 */
export const setupDOMMocks = () => {
    global.document = {
        addEventListener: jest.fn(),
        getElementById: jest.fn(),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(),
    };
    
    global.window = {
        location: {
            href: 'popup.html#',
            hash: '',
            reload: jest.fn(),
        },
        close: jest.fn(),
        confirm: jest.fn(),
    };
};

/**
 * Sets up all common test mocks (Chrome APIs and DOM)
 */
export const setupTestMocks = () => {
    setupChromeMocks();
    setupDOMMocks();
};

/**
 * Creates a mock for console methods (error, warn, log, etc.)
 * @param {string} method - The console method to mock ('error', 'warn', 'log', etc.)
 * @returns {Object} Spy object with properties: called, args, restore()
 */
export const mockConsole = (method) => {
    const original = console[method];
    const spy = { called: false, args: null };
    console[method] = (...capturedArgs) => {
        spy.called = true;
        spy.args = capturedArgs;
    };
    spy.restore = () => console[method] = original;
    return spy;
};

/**
 * Creates a mock for dbService.createSession
 * @param {*} returnValue - Value to return (can be a function for custom behavior)
 */
export const mockDbCreate = (returnValue) => {
    if (typeof returnValue === 'function') {
        dbService.createSession = returnValue;
    } else {
        dbService.createSession = async () => returnValue;
    }
};

/**
 * Creates a mock for dbService.updateSession
 * @param {*} returnValue - Value to return (can be a function for custom behavior)
 */
export const mockDbUpdate = (returnValue) => {
    if (typeof returnValue === 'function') {
        dbService.updateSession = returnValue;
    } else {
        dbService.updateSession = async () => returnValue;
    }
};
