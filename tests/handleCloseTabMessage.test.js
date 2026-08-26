import { handleCloseTabMessage } from '../js/background/background.js';
import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { jest, setupChromeMocks, mockConsole } from './helpers.js';

describe('handleCloseTabMessage', () => {
    let consoleErrorSpy;

    beforeEach(() => {
        setupChromeMocks();
        // setupChromeMocks() doesn't mock chrome.tabs.remove.
        global.chrome.tabs.remove = jest.fn();
        // A successful removeSessionTab call fires updateSpacesWindow(), which looks
        // for an open Spaces window via chrome.storage/chrome.windows.getAll — mock
        // those minimally so it resolves to "no Spaces window open" instead of throwing.
        global.chrome.storage = {
            local: {
                get: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue(),
                remove: jest.fn().mockResolvedValue(),
            },
        };
        global.chrome.runtime.getURL = jest.fn().mockReturnValue('chrome-extension://test/spaces.html');
        global.chrome.windows.getAll = jest.fn().mockResolvedValue([]);

        dbService.fetchSessionById = jest.fn();
        spacesService.updateSessionTabs = jest.fn();

        consoleErrorSpy = mockConsole('error');
    });

    afterEach(() => {
        consoleErrorSpy.restore();
        jest.clearAllMocks();
    });

    describe('live tab (windowId set)', () => {
        test('closes the real tab and returns true on success', async () => {
            global.chrome.tabs.remove.mockResolvedValue();

            const result = await handleCloseTabMessage(false, 123, 456, 0);

            expect(global.chrome.tabs.remove).toHaveBeenCalledWith(456);
            expect(result).toBe(true);
            expect(dbService.fetchSessionById).not.toHaveBeenCalled();
        });

        test('returns false and logs when chrome.tabs.remove rejects', async () => {
            global.chrome.tabs.remove.mockRejectedValue(new Error('no such tab'));

            const result = await handleCloseTabMessage(false, 123, 456, 0);

            expect(result).toBe(false);
            expect(consoleErrorSpy.called).toBe(true);
        });

        test('takes the live-tab branch even when a sessionId is also present', async () => {
            global.chrome.tabs.remove.mockResolvedValue();

            const result = await handleCloseTabMessage(999, 123, 456, 0);

            expect(global.chrome.tabs.remove).toHaveBeenCalledWith(456);
            expect(result).toBe(true);
            expect(spacesService.updateSessionTabs).not.toHaveBeenCalled();
        });
    });

    describe('saved session only (windowId unset)', () => {
        const SESSION_ID = 42;
        const SESSION = {
            id: SESSION_ID,
            tabs: [
                { url: 'https://one.com' },
                { url: 'https://two.com' },
                { url: 'https://three.com' },
            ],
        };

        test('removes the tab at tabIndex and persists the remaining tabs', async () => {
            dbService.fetchSessionById.mockResolvedValue(SESSION);
            spacesService.updateSessionTabs.mockResolvedValue({ ...SESSION });

            const result = await handleCloseTabMessage(SESSION_ID, false, undefined, 1);

            expect(spacesService.updateSessionTabs).toHaveBeenCalledWith(SESSION_ID, [
                { url: 'https://one.com' },
                { url: 'https://three.com' },
            ]);
            expect(result).toBe(true);
            expect(global.chrome.tabs.remove).not.toHaveBeenCalled();
        });

        test('returns false when the session is not found', async () => {
            dbService.fetchSessionById.mockResolvedValue(null);

            const result = await handleCloseTabMessage(SESSION_ID, false, undefined, 0);

            expect(result).toBe(false);
            expect(spacesService.updateSessionTabs).not.toHaveBeenCalled();
            expect(consoleErrorSpy.called).toBe(true);
        });

        test('returns false when tabIndex is out of range', async () => {
            dbService.fetchSessionById.mockResolvedValue(SESSION);

            const result = await handleCloseTabMessage(SESSION_ID, false, undefined, 99);

            expect(result).toBe(false);
            expect(spacesService.updateSessionTabs).not.toHaveBeenCalled();
        });
    });

    test('returns false when neither windowId nor a usable sessionId/tabIndex is provided', async () => {
        const result = await handleCloseTabMessage(false, false, undefined, undefined);

        expect(result).toBe(false);
        expect(global.chrome.tabs.remove).not.toHaveBeenCalled();
        expect(dbService.fetchSessionById).not.toHaveBeenCalled();
    });
});
