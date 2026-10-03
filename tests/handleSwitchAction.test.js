/**
 * Unit tests for handleSwitchAction in js/popup.js
 */
import { jest, setupTestMocks } from './helpers.js';
import { handleSwitchAction } from '../js/popup.js';

setupTestMocks();

describe('handleSwitchAction', () => {
    let spaceEl;
    let errorEl;

    beforeEach(() => {
        jest.clearAllMocks();
        chrome.runtime.sendMessage.mockReset();
        spaceEl = {
            getAttribute: jest.fn(name => (name === 'data-sessionId' ? '42' : 'false')),
        };
        errorEl = { textContent: '', hidden: true };
        document.getElementById.mockImplementation(id => (id === 'switchError' ? errorEl : null));
    });

    test('sends switchToSpace and closes the popup on success', async () => {
        chrome.runtime.sendMessage.mockResolvedValue({ success: true });

        await handleSwitchAction(spaceEl);

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'switchToSpace',
            sessionId: '42',
            windowId: 'false',
        });
        expect(window.close).toHaveBeenCalled();
        expect(errorEl.hidden).toBe(true);
    });

    test('shows the error and stays open when the space could not be opened', async () => {
        chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Nope' });

        await handleSwitchAction(spaceEl);

        expect(errorEl.hidden).toBe(false);
        expect(errorEl.textContent).toBe('This space could not be opened: Nope');
        expect(window.close).not.toHaveBeenCalled();
    });

    test('closes the popup when the background gives no result', async () => {
        chrome.runtime.sendMessage.mockResolvedValue(undefined);

        await handleSwitchAction(spaceEl);

        expect(window.close).toHaveBeenCalled();
    });
});
