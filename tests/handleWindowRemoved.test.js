import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { jest } from './helpers.js';

describe('handleWindowRemoved', () => {
    describe('bounds handling', () => {
        let originalUpdateSession;
        const TEST_SESSION = { 
            id: 123, 
            windowId: 456, 
            name: 'Test Session', 
            tabs: [{ url: 'https://example.com' }], 
            history: [],
            windowBounds: { left: 100, top: 200, width: 800, height: 600 }
        };

        beforeEach(() => {
            // Reset spacesService state
            spacesService.sessions = [];
            spacesService.initialized = true;
            spacesService.closedWindowIds = {};
            spacesService.sessionUpdateTimers = {};
            spacesService.boundsUpdateTimers = {};
            
            // Store original method and mock dbService
            originalUpdateSession = dbService.updateSession;
            dbService.updateSession = jest.fn().mockImplementation(async (session) => {
                // Return the session that was passed in (simulating successful update)
                return { ...session, windowId: false };
            });
            
            // Mock console to suppress debug output during tests
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            // Restore original methods
            if (originalUpdateSession) {
                dbService.updateSession = originalUpdateSession;
            }
            jest.restoreAllMocks();
        });

        test('preserves existing bounds when window is removed', async () => {
            // Add session with existing bounds to memory
            spacesService.sessions.push({ ...TEST_SESSION });
            
            // Handle window removal
            const result = await spacesService.handleWindowRemoved(TEST_SESSION.windowId, true);
            
            expect(result).toBe(true);
            
            // Session should be updated with windowId cleared but bounds preserved
            expect(dbService.updateSession).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: TEST_SESSION.id,
                    windowId: false,
                    windowBounds: TEST_SESSION.windowBounds
                })
            );
            
            // Window should be marked as closed
            expect(spacesService.closedWindowIds[TEST_SESSION.windowId]).toBe(true);
        });

        test('handles session without existing bounds', async () => {
            const sessionWithoutBounds = { ...TEST_SESSION };
            delete sessionWithoutBounds.windowBounds;
            
            spacesService.sessions.push(sessionWithoutBounds);
            
            const result = await spacesService.handleWindowRemoved(TEST_SESSION.windowId, true);
            
            expect(result).toBe(true);
            
            // Session should be updated with windowId cleared
            expect(dbService.updateSession).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: TEST_SESSION.id,
                    windowId: false
                })
            );
            
            // windowBounds should be undefined (not explicitly set)
            const updateCall = dbService.updateSession.mock.calls[0][0];
            expect(updateCall.windowBounds).toBeUndefined();
        });

        test('ignores duplicate window removal events', async () => {
            spacesService.sessions.push({ ...TEST_SESSION });
            
            // First removal
            const result1 = await spacesService.handleWindowRemoved(TEST_SESSION.windowId, true);
            expect(result1).toBe(true);
            
            // Reset mock calls
            dbService.updateSession.mockClear();
            
            // Second removal (duplicate)
            const result2 = await spacesService.handleWindowRemoved(TEST_SESSION.windowId, true);
            expect(result2).toBe(true);
            
            // Database should not be called for duplicate removal
            expect(dbService.updateSession).not.toHaveBeenCalled();
        });

        test('clears bounds update timer when window is removed', async () => {
            spacesService.sessions.push({ ...TEST_SESSION });
            
            // Set up timers (simulating ongoing bounds updates)
            const sessionTimer = setTimeout(() => {}, 1000);
            const boundsTimer = setTimeout(() => {}, 1000);
            spacesService.sessionUpdateTimers[TEST_SESSION.windowId] = sessionTimer;
            spacesService.boundsUpdateTimers[TEST_SESSION.windowId] = boundsTimer;
            
            // Spy on clearTimeout to verify timers are cleared
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            await spacesService.handleWindowRemoved(TEST_SESSION.windowId, true);
            
            // Both timers should be cleared
            expect(clearTimeoutSpy).toHaveBeenCalledWith(sessionTimer);
            expect(clearTimeoutSpy).toHaveBeenCalledWith(boundsTimer);
            
            clearTimeoutSpy.mockRestore();
        });

        test('handles temporary session removal (no bounds to preserve)', async () => {
            const tempSession = { 
                id: false, 
                windowId: 789, 
                name: false, 
                tabs: [{ url: 'https://temp.com' }], 
                history: [] 
            };
            
            spacesService.sessions.push(tempSession);
            
            const result = await spacesService.handleWindowRemoved(tempSession.windowId, true);
            
            expect(result).toBe(true);
            
            // Temporary session should be removed from sessions array
            expect(spacesService.sessions.length).toBe(0);
            
            // Database should not be called for temporary sessions
            expect(dbService.updateSession).not.toHaveBeenCalled();
        });

        test('handles non-existent session gracefully', async () => {
            // No sessions in memory
            
            const result = await spacesService.handleWindowRemoved(999, true);
            
            expect(result).toBe(true);
            expect(dbService.updateSession).not.toHaveBeenCalled();
            expect(spacesService.closedWindowIds[999]).toBe(true);
        });

        test('waits for initialization before processing', async () => {
            spacesService.initialized = false;
            spacesService.ensureInitialized = jest.fn().mockResolvedValue();
            
            await spacesService.handleWindowRemoved(TEST_SESSION.windowId, true);
            
            // ensureInitialized gets called twice: once in handleWindowRemoved, once in getSessionByWindowId
            expect(spacesService.ensureInitialized).toHaveBeenCalledTimes(2);
        });
    });
});
