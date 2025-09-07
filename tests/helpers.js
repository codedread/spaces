/**
 * Shared test helper functions
 */
import { dbService } from '../js/background/dbService.js';

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
