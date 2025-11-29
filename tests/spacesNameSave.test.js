/**
 * Unit tests for spaces.js handleNameSave functionality
 */

import { jest } from '@jest/globals';
import { setupTestMocks } from './helpers.js';

// Import spaces.js module
import * as spacesModule from '../js/spaces.js';

// Setup mocks
setupTestMocks();

describe('spaces.js handleNameSave', () => {
    const SESSION_NAME = 'Original Name';
    let nameFormInput;
    let nameFormDisplay;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup DOM elements
        nameFormInput = {
            value: '',
            style: { display: 'none' },
            focus: jest.fn(),
            blur: jest.fn(),
            addEventListener: jest.fn(),
        };
        nameFormDisplay = {
            innerHTML: '',
            style: { display: 'block' },
            addEventListener: jest.fn(),
        };

        // Mock document.querySelector to return our elements
        document.querySelector.mockImplementation((selector) => {
            if (selector === '#nameForm input') return nameFormInput;
            if (selector === '#nameForm span') return nameFormDisplay;
            return { addEventListener: jest.fn(), setAttribute: jest.fn(), style: {}, innerHTML: '' };
        });

        document.getElementById.mockImplementation(() => {
            return { addEventListener: jest.fn(), setAttribute: jest.fn(), style: {}, innerHTML: '' };
        });


        // Mock chrome.runtime.sendMessage for session presence checks
        chrome.runtime.sendMessage.mockImplementation((msg) => {
            if (msg && msg.action === 'requestAllSpaces') {
                return Promise.resolve([]);
            }
            if (msg && msg.action === 'requestSessionPresence') {
                return Promise.resolve({ exists: false, isOpen: false });
            }
            return Promise.resolve({});
        });

        // Manually set nodes instead of calling initializeSpaces (which has async side effects)
        // Provide minimal mocks for all properties that might be accessed.
        // TODO: See if there is a better way to deal with all the DOM nodes in spaces.js.
        const mockNode = { style: {}, innerHTML: '', addEventListener: jest.fn() };
        spacesModule.setNodesForTesting({
            nameFormInput: nameFormInput,
            nameFormDisplay: nameFormDisplay,
            banner: mockNode,
            // Add other nodes that might be accessed during reroute/updateSpaceDetail
            actionSwitch: mockNode,
            actionOpen: mockNode,
            actionEdit: mockNode,
            actionClose: mockNode,
            actionExport: mockNode,
            actionBackup: mockNode,
            actionDelete: mockNode,
            actionImport: mockNode,
            spaceDetailContainer: mockNode,
            activeTabs: mockNode,
            historicalTabs: mockNode,
            openSpaces: mockNode,
            closedSpaces: mockNode,
        });
    });

    test('does nothing if name is unchanged', async () => {
        spacesModule.setGlobalSelectedSpace({
            name: SESSION_NAME,
            sessionId: 123,
            windowId: 456
        });
        nameFormInput.value = SESSION_NAME;

        await spacesModule.handleNameSave();

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        // Should revert to display mode
        expect(nameFormInput.style.display).toBe('none');
        expect(nameFormDisplay.style.display).toBe('inline');
    });

    test('reverts if name is empty', async () => {
        spacesModule.setGlobalSelectedSpace({
            name: SESSION_NAME,
            sessionId: 123,
            windowId: 456
        });
        nameFormInput.value = '   '; // Empty/whitespace

        await spacesModule.handleNameSave();

        expect(nameFormInput.value).toBe(SESSION_NAME); // Restores name
    });

    test('allows case-insensitive rename without overwrite check', async () => {
        spacesModule.setGlobalSelectedSpace({
            name: SESSION_NAME,
            sessionId: 123,
            windowId: 456
        });
        nameFormInput.value = SESSION_NAME.toLowerCase();

        await spacesModule.handleNameSave();

        // Should NOT send requestSessionPresence
        const sessionPresenceCalls = chrome.runtime.sendMessage.mock.calls.filter(
            call => call[0].action === 'requestSessionPresence'
        );
        expect(sessionPresenceCalls.length).toBe(0);

        // Should send update message
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'updateSessionName',
            deleteOld: true,
            sessionName: SESSION_NAME.toLowerCase(),
            sessionId: 123,
        });
    });

    test('checks overwrite for different name', async () => {
        spacesModule.setGlobalSelectedSpace({
            name: SESSION_NAME,
            sessionId: 123,
            windowId: 456
        });
        nameFormInput.value = 'New Name';

        // Mock session presence to indicate existing session
        chrome.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.action === 'requestAllSpaces') {
                return Promise.resolve([]);
            }
            if (msg.action === 'requestSessionPresence') {
                return Promise.resolve({ exists: true, isOpen: false });
            }
            return Promise.resolve({});
        });

        // Mock confirm to return true
        window.confirm.mockReturnValue(true);

        await spacesModule.handleNameSave();

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
        spacesModule.setGlobalSelectedSpace({
            name: SESSION_NAME,
            sessionId: 123,
            windowId: 456
        });
        nameFormInput.value = 'New Name';

        // Mock session presence to indicate existing session
        chrome.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.action === 'requestAllSpaces') {
                return Promise.resolve([]);
            }
            if (msg.action === 'requestSessionPresence') {
                return Promise.resolve({ exists: true, isOpen: false });
            }
            return Promise.resolve({});
        });

        // Mock confirm to return false
        window.confirm.mockReturnValue(false);

        await spacesModule.handleNameSave();

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

        expect(nameFormInput.value).toBe(SESSION_NAME); // Restores original name
    });

    test('saves new session if no sessionId', async () => {
        spacesModule.setGlobalSelectedSpace({
            name: SESSION_NAME,
            sessionId: false, // No session ID yet
            windowId: 456
        });
        nameFormInput.value = 'New Name';

        // Mock confirm to return true
        window.confirm.mockReturnValue(true);

        chrome.runtime.sendMessage.mockResolvedValue({
            id: 789,
            name: 'New Name'
        });

        await spacesModule.handleNameSave();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'saveNewSession',
            deleteOld: true,
            sessionName: 'New Name',
            windowId: 456,
        });
    });
});
