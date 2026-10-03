/**
 * Unit tests for handleLoadTab in js/spaces.js
 */
import { jest, setupTestMocks } from './helpers.js';
import { handleLoadTab } from '../js/spaces.js';

setupTestMocks();

describe('handleLoadTab', () => {
    beforeEach(() => {
        chrome.runtime.sendMessage.mockReset();
        window.alert = jest.fn();
    });

    test('loads a tab from a closed space and says nothing when all went well', async () => {
        chrome.runtime.sendMessage.mockResolvedValue({ success: true });

        await handleLoadTab(42, false, 'https://a.com');

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'loadTabInSession',
            sessionId: 42,
            tabUrl: 'https://a.com',
        });
        expect(window.alert).not.toHaveBeenCalled();
    });

    test('alerts when the space could not be opened', async () => {
        chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Nope' });

        await handleLoadTab(42, false, 'https://a.com');

        expect(window.alert).toHaveBeenCalledWith('This space could not be opened: Nope');
    });

    test('loads a tab in an open window without alerting', async () => {
        chrome.runtime.sendMessage.mockResolvedValue(true);

        await handleLoadTab(false, 7, 'https://a.com');

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'loadTabInWindow',
            windowId: 7,
            tabUrl: 'https://a.com',
        });
        expect(window.alert).not.toHaveBeenCalled();
    });
});
