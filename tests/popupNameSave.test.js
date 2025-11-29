/**
 * Unit tests for popup.js handleNameSave functionality
 */

import { jest } from '@jest/globals';
import { setupTestMocks } from './helpers.js';
import { handleNameSave, setGlobalCurrentSpace } from '../js/popup.js';

// Setup mocks
setupTestMocks();

describe('popup.js handleNameSave', () => {
    let inputEl;
    const SESSION_NAME = 'Original Name';

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup DOM elements
        inputEl = {
            value: '',
            blur: jest.fn(),
            focus: jest.fn(),
        };

        document.getElementById.mockImplementation((id) => {
            if (id === 'activeSpaceTitle') return inputEl;
            return null;
        });

        // Reset global state
        setGlobalCurrentSpace({
            name: SESSION_NAME,
            sessionId: 123,
            windowId: 456
        });

        // Mock chrome.runtime.sendMessage for requestSessionPresence
        chrome.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.action === 'requestSessionPresence') {
                return Promise.resolve({ exists: false, isOpen: false });
            }
            return Promise.resolve({});
        });
    });

    test('does nothing if name is unchanged', async () => {
        inputEl.value = SESSION_NAME;

        await handleNameSave();

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('restores placeholder if name is empty and space was unnamed', async () => {
        setGlobalCurrentSpace({
            name: false, // Unnamed
            sessionId: false,
            windowId: 456
        });
        inputEl.value = '   '; // Empty/whitespace

        await handleNameSave();

        expect(inputEl.value).toBe('(unnamed window)');
    });

    test('allows case-insensitive rename without overwrite check', async () => {
        inputEl.value = SESSION_NAME.toLowerCase(); // Different case

        await handleNameSave();

        // Should NOT send requestSessionPresence
        const sessionPresenceCalls = chrome.runtime.sendMessage.mock.calls.filter(
            call => call[0].action === 'requestSessionPresence'
        );
        expect(sessionPresenceCalls.length).toBe(0);

        // Should send update message
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'updateSessionName',
            deleteOld: true,
            sessionName: 'original name',
            sessionId: 123,
        });
    });

    test('checks overwrite for different name', async () => {
        inputEl.value = 'New Name';

        // Mock session presence to indicate existing session
        chrome.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.action === 'requestSessionPresence') {
                return Promise.resolve({ exists: true, isOpen: false });
            }
            return Promise.resolve({});
        });

        // Mock confirm to return true
        window.confirm.mockReturnValue(true);

        await handleNameSave();

        // Should check for session presence
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'requestSessionPresence',
            sessionName: 'New Name',
        });

        // Should ask for confirmation
        expect(window.confirm).toHaveBeenCalled();

        // Should send update message
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'updateSessionName',
            deleteOld: true,
            sessionName: 'New Name',
            sessionId: 123,
        });
    });

    test('aborts if overwrite check fails', async () => {
        inputEl.value = 'New Name';

        // Mock session presence to indicate existing session
        chrome.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.action === 'requestSessionPresence') {
                return Promise.resolve({ exists: true, isOpen: false });
            }
            return Promise.resolve({});
        });

        // Mock confirm to return false
        window.confirm.mockReturnValue(false);

        await handleNameSave();

        // Should check for session presence
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'requestSessionPresence',
            sessionName: 'New Name',
        });

        // Should ask for confirmation
        expect(window.confirm).toHaveBeenCalled();

        // Should NOT send update message
        const updateCalls = chrome.runtime.sendMessage.mock.calls.filter(
            call => call[0].action === 'updateSessionName'
        );
        expect(updateCalls.length).toBe(0);

        expect(inputEl.value).toBe('Original Name'); // Restores original name
    });

    test('saves new session if no sessionId', async () => {
        setGlobalCurrentSpace({
            name: 'Old Name',
            sessionId: false, // No session ID yet
            windowId: 456
        });
        inputEl.value = 'New Name';

        // Mock confirm to return true
        window.confirm.mockReturnValue(true);

        chrome.runtime.sendMessage.mockResolvedValue({
            id: 789,
            name: 'New Name'
        });

        await handleNameSave();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'saveNewSession',
            deleteOld: true,
            sessionName: 'New Name',
            windowId: 456,
        });
    });
});
