import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as backgroundModule from '../js/background/background.js';
import { dbService } from '../js/background/dbService.js';
import { spacesService } from '../js/background/spacesService.js';
import { setupChromeMocks, mockConsole } from './helpers.js';

describe('requestSpaceFromWindowId', () => {
    let fetchSessionByWindowIdSpy;
    let fetchSessionByIdSpy;
    let updateSessionSpy;
    let getAllSessionsSpy;
    let consoleLogSpy;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup Chrome API mocks using helpers
        setupChromeMocks();

        // Mock console.log to suppress output during tests
        consoleLogSpy = mockConsole('log');

        // Spy on dbService methods
        fetchSessionByWindowIdSpy = jest.spyOn(dbService, 'fetchSessionByWindowId');
        fetchSessionByIdSpy = jest.spyOn(dbService, 'fetchSessionById');
        updateSessionSpy = jest.spyOn(dbService, 'updateSession');

        // Spy on spacesService.getAllSessions (used by requestAllSpaces)
        getAllSessionsSpy = jest.spyOn(spacesService, 'getAllSessions');
    });

    afterEach(() => {
        if (consoleLogSpy) {
            consoleLogSpy.restore();
        }
        jest.restoreAllMocks();
    });

    test('returns existing session when found by windowId', async () => {
        const mockSession = {
            id: 123,
            windowId: 456,
            name: 'Existing Session',
            tabs: [{ url: 'https://example.com' }],
            history: [],
        };

        fetchSessionByWindowIdSpy.mockResolvedValue(mockSession);

        const result = await backgroundModule.requestSpaceFromWindowId(456, false);

        expect(result).toEqual({
            sessionId: 123,
            windowId: 456,
            name: 'Existing Session',
            tabs: [{ url: 'https://example.com' }],
            history: [],
        });
        expect(fetchSessionByWindowIdSpy).toHaveBeenCalledWith(456);
    });

    test('returns space built from window when no session found and matchByTabs is false', async () => {
        const mockWindow = {
            id: 789,
            tabs: [
                { url: 'https://example.com' },
                { url: 'https://test.com' },
            ],
        };

        fetchSessionByWindowIdSpy.mockResolvedValue(null);
        global.chrome.windows.get.mockResolvedValue(mockWindow);

        const result = await backgroundModule.requestSpaceFromWindowId(789, false);

        expect(result).toEqual({
            sessionId: false,
            windowId: 789,
            name: false,
            tabs: mockWindow.tabs,
            history: false,
        });
        expect(global.chrome.windows.get).toHaveBeenCalledWith(789, { populate: true });
    });

    // TESTME: Ensure that if matchByTabs is true, that if an equivalent space exists with
    //     same tabs, use that.
    describe('matchByTabs functionality (TESTME)', () => {
        test('finds and uses equivalent space with same tabs when matchByTabs is true', async () => {
            const windowId = 999;
            const mockWindow = {
                id: windowId,
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
            };

            const matchingSpace = {
                sessionId: 555,
                windowId: null, // Previously had no windowId
                name: 'Matching Space',
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
                history: [],
            };

            // Mock session data (getAllSessions returns sessions with 'id', not 'sessionId')
            // Convert matchingSpace to session format
            const mockSession = {
                id: matchingSpace.sessionId,
                windowId: matchingSpace.windowId,
                name: matchingSpace.name,
                tabs: matchingSpace.tabs,
                history: matchingSpace.history,
            };

            fetchSessionByWindowIdSpy.mockResolvedValue(null);
            global.chrome.windows.get.mockResolvedValue(mockWindow);

            // Mock getAllSessions to return sessions that will be converted to matching space
            getAllSessionsSpy.mockResolvedValue([mockSession]);

            // fetchSessionById returns the same format as mockSession
            fetchSessionByIdSpy.mockResolvedValue(mockSession);
            updateSessionSpy.mockImplementation(async (session) => {
                return { ...session };
            });

            const result = await backgroundModule.requestSpaceFromWindowId(windowId, true);

            // Verify getAllSessions was called (via requestAllSpaces)
            expect(getAllSessionsSpy).toHaveBeenCalled();

            // Verify fetchSessionById was called with the matching session ID
            expect(fetchSessionByIdSpy).toHaveBeenCalledWith(matchingSpace.sessionId);

            // Verify updateSession was called to update the windowId
            expect(updateSessionSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: matchingSpace.sessionId,
                    windowId: windowId,
                })
            );

            // Verify the returned space matches matchingSpace (with updated windowId)
            expect(result.sessionId).toBe(matchingSpace.sessionId);
            expect(result.windowId).toBe(windowId);
            expect(result.name).toBe(matchingSpace.name);
            expect(result.tabs).toEqual(matchingSpace.tabs);
            expect(result.history).toEqual(matchingSpace.history);
        });

        test('does not match spaces with different tab URLs', async () => {
            const windowId = 888;
            const mockWindow = {
                id: windowId,
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
            };

            fetchSessionByWindowIdSpy.mockResolvedValue(null);
            global.chrome.windows.get.mockResolvedValue(mockWindow);

            // Mock getAllSessions to return non-matching space
            getAllSessionsSpy.mockResolvedValue([{
                id: 777,
                windowId: null,
                name: 'Different Space',
                tabs: [
                    { url: 'https://different.com' },
                    { url: 'https://other.com' },
                ],
                history: [],
            }]);

            const result = await backgroundModule.requestSpaceFromWindowId(windowId, true);

            // Verify getAllSessions was called (via requestAllSpaces)
            expect(getAllSessionsSpy).toHaveBeenCalled();

            // Verify updateSession was NOT called (no match found)
            expect(updateSessionSpy).not.toHaveBeenCalled();

            // Should return space built from window instead
            expect(result).toEqual({
                sessionId: false,
                windowId: windowId,
                name: false,
                tabs: mockWindow.tabs,
                history: false,
            });
        });

        test('does not match spaces with different number of tabs', async () => {
            const windowId = 777;
            const mockWindow = {
                id: windowId,
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
            };

            // Space with more tabs than the window (should not match)
            const spaceWithMoreTabs = {
                id: 666,
                windowId: null,
                name: 'More Tabs Space',
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                    { url: 'https://extra.com' },
                ],
                history: [],
            };

            fetchSessionByWindowIdSpy.mockResolvedValue(null);
            global.chrome.windows.get.mockResolvedValue(mockWindow);

            getAllSessionsSpy.mockResolvedValue([spaceWithMoreTabs]);

            const result = await backgroundModule.requestSpaceFromWindowId(windowId, true);

            expect(getAllSessionsSpy).toHaveBeenCalled();
            expect(updateSessionSpy).not.toHaveBeenCalled();

            // Should return space built from window
            expect(result).toEqual({
                sessionId: false,
                windowId: windowId,
                name: false,
                tabs: mockWindow.tabs,
                history: false,
            });
        });

        test('does not match spaces with same URLs in different order', async () => {
            const windowId = 666;
            const mockWindow = {
                id: windowId,
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
            };

            const spaceWithDifferentOrder = {
                id: 555,
                windowId: null,
                name: 'Different Order Space',
                tabs: [
                    { url: 'https://test.com' },
                    { url: 'https://example.com' },
                ],
                history: [],
            };

            fetchSessionByWindowIdSpy.mockResolvedValue(null);
            global.chrome.windows.get.mockResolvedValue(mockWindow);

            getAllSessionsSpy.mockResolvedValue([spaceWithDifferentOrder]);

            const result = await backgroundModule.requestSpaceFromWindowId(windowId, true);

            expect(getAllSessionsSpy).toHaveBeenCalled();
            expect(updateSessionSpy).not.toHaveBeenCalled();

            // Should return space built from window
            expect(result).toEqual({
                sessionId: false,
                windowId: windowId,
                name: false,
                tabs: mockWindow.tabs,
                history: false,
            });
        });

        test('matches first space with equivalent tabs when multiple spaces exist', async () => {
            const windowId = 555;
            const mockWindow = {
                id: windowId,
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
            };

            const firstMatchingSpace = {
                id: 111,
                windowId: null,
                name: 'First Match',
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://test.com' },
                ],
                history: [],
            };

            const secondMatchingSpace = {
                ...firstMatchingSpace,
                id: 222,
            };

            fetchSessionByWindowIdSpy.mockResolvedValue(null);
            global.chrome.windows.get.mockResolvedValue(mockWindow);

            getAllSessionsSpy.mockResolvedValue([
                firstMatchingSpace,
                secondMatchingSpace,
            ]);

            fetchSessionByIdSpy.mockResolvedValue(firstMatchingSpace);
            updateSessionSpy.mockImplementation(async (session) => {
                return { ...session };
            });

            const result = await backgroundModule.requestSpaceFromWindowId(windowId, true);

            expect(getAllSessionsSpy).toHaveBeenCalled();
            expect(fetchSessionByIdSpy).toHaveBeenCalledWith(111); // First match
            expect(updateSessionSpy).toHaveBeenCalledTimes(1);
            expect(result.sessionId).toBe(111); // Should use first match
        });

        test('does not match when matchByTabs is false', async () => {
            const windowId = 444;
            const mockWindow = {
                id: windowId,
                tabs: [
                    { url: 'https://example.com' },
                ],
            };

            const matchingSpace = {
                id: 333,
                windowId: null,
                name: 'Matching Space',
                tabs: [
                    { url: 'https://example.com' },
                ],
                history: [],
            };

            fetchSessionByWindowIdSpy.mockResolvedValue(null);
            global.chrome.windows.get.mockResolvedValue(mockWindow);

            getAllSessionsSpy.mockResolvedValue([matchingSpace]);

            const result = await backgroundModule.requestSpaceFromWindowId(windowId, false);

            // getAllSessions should not be called when matchByTabs is false
            expect(getAllSessionsSpy).not.toHaveBeenCalled();
            expect(updateSessionSpy).not.toHaveBeenCalled();

            // Should return space built from window
            expect(result).toEqual({
                sessionId: false,
                windowId: windowId,
                name: false,
                tabs: mockWindow.tabs,
                history: false,
            });
        });
    });
});

