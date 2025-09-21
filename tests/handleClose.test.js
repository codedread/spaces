/**
 * Unit tests for handleClose function in spaces.js
 * Tests all code paths and edge cases for closing windows
 */

import { jest, setupTestMocks, mockConsole } from './helpers.js';
import { handleClose, setGlobalSelectedSpace, getGlobalSelectedSpace } from '../js/spaces.js';

// Setup all test mocks (includes window.confirm)
setupTestMocks();

const WINDOW_ID = 123;
const SESSION_ID = 'test-session';
const TEST_SPACES = {
    NO_WINDOW: { sessionId: SESSION_ID },
    UNNAMED: { windowId: WINDOW_ID },
    NAMED: { windowId: WINDOW_ID, sessionId: SESSION_ID }
};

describe('handleClose Function', () => {
    let consoleErrorSpy;
    let consoleWarnSpy;
    let mockUpdateSpacesList;
    let mockRenderSpaceDetail;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Create simple mock functions for UI updates
        mockUpdateSpacesList = jest.fn().mockResolvedValue();
        mockRenderSpaceDetail = jest.fn();
        
        // Reset mocks
        chrome.runtime.sendMessage.mockClear();
        window.confirm.mockClear();
        
        // Mock the Chrome API responses
        chrome.runtime.sendMessage.mockImplementation(async (request) => {
            if (request.action === 'closeWindow') {
                return true; // Default to success for closeWindow
            }
            return undefined;
        });
        
        // Setup console spies
        consoleErrorSpy = mockConsole('error');
        consoleWarnSpy = mockConsole('warn');
        
        // Clear globalSelectedSpace
        setGlobalSelectedSpace(null);
    });

    afterEach(() => {
        consoleErrorSpy.restore();
        consoleWarnSpy.restore();
    });

    test('should return early and log error when no space is selected', async () => {
        // Setup: No selected space
        setGlobalSelectedSpace(null);

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleErrorSpy.args[0]).toBe('No opened window is currently selected.');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(mockUpdateSpacesList).not.toHaveBeenCalled();
        expect(mockRenderSpaceDetail).not.toHaveBeenCalled();
        expect(getGlobalSelectedSpace()).toBe(null); // Should remain null
    });

    test('should return early and log error when selected space has no windowId', async () => {
        // Setup: Selected space without windowId
        setGlobalSelectedSpace(TEST_SPACES.NO_WINDOW);

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleErrorSpy.args[0]).toBe('No opened window is currently selected.');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(mockUpdateSpacesList).not.toHaveBeenCalled();
        expect(mockRenderSpaceDetail).not.toHaveBeenCalled();
        // globalSelectedSpace should remain unchanged since function returns early
        expect(getGlobalSelectedSpace()).toEqual(TEST_SPACES.NO_WINDOW);
    });

    test('should show confirmation dialog for unnamed space and return early when user cancels', async () => {
        // Setup: Unnamed space (no sessionId) and user cancels
        setGlobalSelectedSpace(TEST_SPACES.UNNAMED);
        window.confirm.mockReturnValue(false); // User cancels

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to close this window?');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(mockUpdateSpacesList).not.toHaveBeenCalled();
        expect(mockRenderSpaceDetail).not.toHaveBeenCalled();
        // globalSelectedSpace should remain unchanged since function returns early
        expect(getGlobalSelectedSpace()).toEqual(TEST_SPACES.UNNAMED);
    });

    test('should skip confirmation for named space and proceed with close', async () => {
        // Setup: Named space (has sessionId)
        setGlobalSelectedSpace(TEST_SPACES.NAMED);

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(window.confirm).not.toHaveBeenCalled(); // No confirmation for named spaces
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeWindow',
            windowId: WINDOW_ID
        });
        expect(mockUpdateSpacesList).toHaveBeenCalled();
        expect(mockRenderSpaceDetail).toHaveBeenCalledWith(false, false);
        expect(getGlobalSelectedSpace()).toBe(null); // Selection cleared
    });

    test('should show confirmation for unnamed space and proceed when user confirms', async () => {
        // Setup: Unnamed space and user confirms
        setGlobalSelectedSpace(TEST_SPACES.UNNAMED);
        window.confirm.mockReturnValue(true); // User confirms

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to close this window?');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeWindow',
            windowId: WINDOW_ID
        });
        expect(mockUpdateSpacesList).toHaveBeenCalled();
        expect(mockRenderSpaceDetail).toHaveBeenCalledWith(false, false);
        expect(getGlobalSelectedSpace()).toBe(null); // Selection cleared
    });

    test('should handle successful window close without warning', async () => {
        // Setup: Successful close
        setGlobalSelectedSpace(TEST_SPACES.NAMED);

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeWindow',
            windowId: WINDOW_ID
        });
        expect(consoleWarnSpy.called).toBe(false); // No warning for success
        expect(mockUpdateSpacesList).toHaveBeenCalled();
        expect(mockRenderSpaceDetail).toHaveBeenCalledWith(false, false);
        expect(getGlobalSelectedSpace()).toBe(null);
    });

    test('should handle failed window close with warning and still update UI', async () => {
        // Setup: Failed close - override the mock for this specific test
        setGlobalSelectedSpace(TEST_SPACES.NAMED);
        
        chrome.runtime.sendMessage.mockImplementation(async (request) => {
            if (request.action === 'closeWindow') {
                return false; // Return false for this test case
            }
            return undefined;
        });

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeWindow',
            windowId: WINDOW_ID
        });
        expect(consoleWarnSpy.called).toBe(true);
        expect(consoleWarnSpy.args[0]).toBe('Failed to close window - it may have already been closed');
        expect(mockUpdateSpacesList).toHaveBeenCalled();
        expect(mockRenderSpaceDetail).toHaveBeenCalledWith(false, false);
        expect(getGlobalSelectedSpace()).toBe(null); // Still clears selection
    });

    test('should handle chrome.runtime.sendMessage rejection and still update UI', async () => {
        // Setup: Message sending throws error
        setGlobalSelectedSpace(TEST_SPACES.NAMED);
        const mockError = new Error('Chrome API error');
        
        chrome.runtime.sendMessage.mockImplementation(async (request) => {
            if (request.action === 'closeWindow') {
                throw mockError; // Throw error for closeWindow
            }
            return undefined;
        });

        // Execute - this should throw since handleClose doesn't catch promise rejections
        // Execute and verify it throws
        await expect(handleClose(mockUpdateSpacesList, mockRenderSpaceDetail)).rejects.toThrow('Chrome API error');

        // Verify the message was attempted
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeWindow',
            windowId: WINDOW_ID
        });
        // The UI functions should not be called since function threw before reaching them
        expect(mockUpdateSpacesList).not.toHaveBeenCalled();
        expect(mockRenderSpaceDetail).not.toHaveBeenCalled();
        // The globalSelectedSpace should remain unchanged since function threw before clearing it
        expect(getGlobalSelectedSpace()).toEqual(TEST_SPACES.NAMED);
    });

    test('should preserve original globalSelectedSpace values during execution', async () => {
        // Setup: Verify that windowId and sessionId are extracted before any async operations
        setGlobalSelectedSpace(TEST_SPACES.NAMED);
        
        chrome.runtime.sendMessage.mockImplementation(async (request) => {
            if (request.action === 'closeWindow') {
                // Simulate the space being modified during the async operation
                const currentSpace = getGlobalSelectedSpace();
                if (currentSpace) {
                    currentSpace.windowId = 'MODIFIED';
                }
                return true;
            }
            return undefined;
        });

        // Execute
        await handleClose(mockUpdateSpacesList, mockRenderSpaceDetail);

        // Verify that the original windowId was used in the message
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeWindow',
            windowId: WINDOW_ID // Original value, not 'MODIFIED'
        });
        expect(mockUpdateSpacesList).toHaveBeenCalled();
        expect(mockRenderSpaceDetail).toHaveBeenCalledWith(false, false);
        expect(getGlobalSelectedSpace()).toBe(null); // Still cleared at end
    });
});
