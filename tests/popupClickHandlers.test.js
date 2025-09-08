/**
 * Unit tests for popup.js functionality
 * Tests the popup menu item click handlers that send messages to background script
 */

import { jest, setupTestMocks } from './helpers.js';
import { handlePopupMenuClick } from '../js/popup.js';

// Setup all test mocks
setupTestMocks();

describe('Popup Menu Click Handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Reset window location
        window.location.hash = '';
        window.location.reload.mockClear();
        chrome.runtime.sendMessage.mockClear();
    });

    test('handlePopupMenuClick with switch action sends correct message and reloads popup', async () => {
        // Setup: Mock successful response from background script
        const mockParams = 'action=switch&windowId=123&sessionName=TestSpace&tabId=456';
        chrome.runtime.sendMessage.mockResolvedValue(mockParams);
        
        // Execute the click handler with switch action
        await handlePopupMenuClick('switch');

        // Verify the message was sent with correct parameters
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            'action': 'generatePopupParams',
            'popupAction': 'switch'
        });

        // Verify popup was reloaded with correct parameters
        expect(window.location.hash).toBe(mockParams);
        expect(window.location.reload).toHaveBeenCalled();
    });

    test('handlePopupMenuClick with move action sends correct message and reloads popup', async () => {
        // Setup: Mock successful response from background script
        const mockParams = 'action=move&windowId=123&sessionName=TestSpace&tabId=456';
        chrome.runtime.sendMessage.mockResolvedValue(mockParams);
        
        // Execute the click handler with move action
        await handlePopupMenuClick('move');

        // Verify the message was sent with correct parameters
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            'action': 'generatePopupParams',
            'popupAction': 'move'
        });

        // Verify popup was reloaded with correct parameters
        expect(window.location.hash).toBe(mockParams);
        expect(window.location.reload).toHaveBeenCalled();
    });

    test('handlePopupMenuClick handles empty response gracefully', async () => {
        // Setup: Mock empty response from background script
        chrome.runtime.sendMessage.mockResolvedValue('');
        
        // Execute the click handler
        await handlePopupMenuClick('test');

        // Verify the message was sent
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            'action': 'generatePopupParams',
            'popupAction': 'test'
        });

        // Verify popup was NOT reloaded due to empty response
        expect(window.location.hash).toBe('');
        expect(window.location.reload).not.toHaveBeenCalled();
    });

    test('handlePopupMenuClick handles null response gracefully', async () => {
        // Setup: Mock null response from background script
        chrome.runtime.sendMessage.mockResolvedValue(null);
        
        // Execute the click handler
        await handlePopupMenuClick('move');

        // Verify the message was sent
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            'action': 'generatePopupParams',
            'popupAction': 'move'
        });

        // Verify popup was NOT reloaded due to null response
        expect(window.location.hash).toBe('');
        expect(window.location.reload).not.toHaveBeenCalled();
    });

    test('handlePopupMenuClick handles sendMessage rejection', async () => {
        // Setup: Mock sendMessage rejection
        const mockError = new Error('Background script error');
        chrome.runtime.sendMessage.mockRejectedValue(mockError);
        
        // Execute the click handler - it should throw since there's no error handling
        await expect(handlePopupMenuClick('switch')).rejects.toThrow('Background script error');

        // Verify the message was sent
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            'action': 'generatePopupParams',
            'popupAction': 'switch'
        });

        // Verify popup was NOT reloaded due to error
        expect(window.location.hash).toBe('');
        expect(window.location.reload).not.toHaveBeenCalled();
    });
});
