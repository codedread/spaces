/**
 * Unit tests for handleCloseTab in js/spaces.js
 */
import { jest, setupTestMocks } from './helpers.js';
import { handleCloseTab } from '../js/spaces.js';

setupTestMocks();

describe('handleCloseTab', () => {
    let mockRenderTabs;
    let tabOne;
    let tabTwo;
    let space;

    beforeEach(() => {
        chrome.runtime.sendMessage.mockClear();
        mockRenderTabs = jest.fn();

        tabOne = { id: 111, url: 'https://one.com' };
        tabTwo = { id: 222, url: 'https://two.com' };
        space = { sessionId: false, windowId: 999, tabs: [tabOne, tabTwo] };
    });

    test('does nothing when no space is provided', async () => {
        await handleCloseTab(tabOne, false, mockRenderTabs);

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(mockRenderTabs).not.toHaveBeenCalled();
    });

    test('does nothing when the tab is not found in the space', async () => {
        const strayTab = { id: 333, url: 'https://stray.com' };

        await handleCloseTab(strayTab, space, mockRenderTabs);

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(mockRenderTabs).not.toHaveBeenCalled();
    });

    test('sends windowId/tabId for an open space and removes the tab locally on success', async () => {
        chrome.runtime.sendMessage.mockResolvedValue(true);

        await handleCloseTab(tabOne, space, mockRenderTabs);

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeTab',
            sessionId: false,
            windowId: 999,
            tabId: 111,
            tabIndex: 0,
        });
        expect(space.tabs).toEqual([tabTwo]);
        expect(mockRenderTabs).toHaveBeenCalledWith(space);
    });

    test('sends sessionId/tabIndex for a closed/saved space', async () => {
        space = { sessionId: 42, windowId: false, tabs: [tabOne, tabTwo] };
        chrome.runtime.sendMessage.mockResolvedValue(true);

        await handleCloseTab(tabTwo, space, mockRenderTabs);

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'closeTab',
            sessionId: 42,
            windowId: false,
            tabId: 222,
            tabIndex: 1,
        });
        expect(space.tabs).toEqual([tabOne]);
        expect(mockRenderTabs).toHaveBeenCalledWith(space);
    });

    test('leaves space.tabs unchanged and does not render when the message fails', async () => {
        chrome.runtime.sendMessage.mockResolvedValue(false);

        await handleCloseTab(tabOne, space, mockRenderTabs);

        expect(space.tabs).toEqual([tabOne, tabTwo]);
        expect(mockRenderTabs).not.toHaveBeenCalled();
    });
});
