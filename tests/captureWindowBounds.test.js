import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { jest } from './helpers.js';

describe('captureWindowBounds', () => {
    let originalUpdateSession;
    let originalEnsureInitialized;
    const TEST_SESSION = { 
        id: 123, 
        windowId: 456, 
        name: 'Test Session', 
        tabs: [{ url: 'https://example.com' }], 
        history: [] 
    };
    const TEST_BOUNDS = {
        left: 100,
        top: 200,
        width: 800,
        height: 600
    };

    beforeEach(() => {
        jest.useFakeTimers();
        
        // Reset spacesService state
        spacesService.sessions = [];
        spacesService.initialized = true;
        spacesService.boundsUpdateTimers = {};
        
        // Store original methods
        originalUpdateSession = dbService.updateSession;
        originalEnsureInitialized = spacesService.ensureInitialized;
        
        // Mock methods
        dbService.updateSession = jest.fn().mockImplementation(async (session) => {
            // Return the session that was passed in (simulating successful update)
            return session;
        });
        
        spacesService.ensureInitialized = jest.fn().mockResolvedValue();
        
        // Mock console to suppress debug output during tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.useRealTimers();
        
        // Restore original methods
        if (originalUpdateSession) {
            dbService.updateSession = originalUpdateSession;
        }
        if (originalEnsureInitialized) {
            spacesService.ensureInitialized = originalEnsureInitialized;
        }
        jest.restoreAllMocks();
    });

    test('captures bounds immediately in memory for saved session', async () => {
        // Add session to memory
        spacesService.sessions.push({ ...TEST_SESSION });
        
        // Capture bounds
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, TEST_BOUNDS);
        
        // Verify bounds are immediately stored in memory
        const session = spacesService.sessions.find(s => s.id === TEST_SESSION.id);
        expect(session.windowBounds).toEqual(TEST_BOUNDS);
        
        // Database update should be debounced (not called yet)
        expect(dbService.updateSession).not.toHaveBeenCalled();
    });

    test('ignores bounds capture for temporary sessions (no id)', async () => {
        const tempSession = { id: false, windowId: 456, name: false, tabs: [], history: [] };
        spacesService.sessions.push(tempSession);
        
        await spacesService.captureWindowBounds(456, TEST_BOUNDS);
        
        // Bounds should not be captured for temporary sessions
        expect(tempSession.windowBounds).toBeUndefined();
        expect(dbService.updateSession).not.toHaveBeenCalled();
    });

    test('ignores bounds capture for non-existent sessions', async () => {
        // No sessions in memory
        
        await spacesService.captureWindowBounds(999, TEST_BOUNDS);
        
        // No database calls should be made
        expect(dbService.updateSession).not.toHaveBeenCalled();
    });

    test('debounces database writes after 1 second', async () => {
        spacesService.sessions.push({ ...TEST_SESSION });
        
        // Capture bounds
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, TEST_BOUNDS);
        
        // Database should not be called immediately
        expect(dbService.updateSession).not.toHaveBeenCalled();
        
        // Fast forward past debounce period
        jest.advanceTimersByTime(1000);
        
        // Wait for the setTimeout callback to execute
        await jest.runAllTimersAsync();
        
        // Database should now be called
        expect(dbService.updateSession).toHaveBeenCalledTimes(1);
        expect(dbService.updateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: TEST_SESSION.id,
                windowBounds: TEST_BOUNDS
            })
        );
    });

    test('debounces rapid bounds changes (only saves final state)', async () => {
        const testSession = { ...TEST_SESSION };
        spacesService.sessions.push(testSession);
        
        const bounds1 = { left: 100, top: 100, width: 800, height: 600 };
        const bounds2 = { left: 200, top: 200, width: 800, height: 600 };
        const bounds3 = { left: 300, top: 300, width: 800, height: 600 };
        
        // Rapid bounds changes
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, bounds1);
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, bounds2);
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, bounds3);
        
        // All bounds should be immediately available in memory (latest one)
        expect(testSession.windowBounds).toEqual(bounds3);
        
        // No database calls yet
        expect(dbService.updateSession).not.toHaveBeenCalled();
        
        // Fast forward past debounce period
        jest.advanceTimersByTime(1000);
        await jest.runAllTimersAsync();
        
        // Database should be called only once with the session containing final bounds
        expect(dbService.updateSession).toHaveBeenCalledTimes(1);
        expect(dbService.updateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: TEST_SESSION.id,
                windowBounds: bounds3
            })
        );
    });

    test('handles database errors gracefully during bounds save', async () => {
        const testSession = { ...TEST_SESSION };
        spacesService.sessions.push(testSession);
        
        // Mock database failure
        dbService.updateSession.mockRejectedValue(new Error('Database error'));
        
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, TEST_BOUNDS);
        
        // Bounds should still be captured in memory
        expect(testSession.windowBounds).toEqual(TEST_BOUNDS);
        
        // Fast forward past debounce period
        jest.advanceTimersByTime(1000);
        await jest.runAllTimersAsync();
        
        // Database should have been called and error logged
        expect(dbService.updateSession).toHaveBeenCalledTimes(1);
        // The error is logged by _updateSessionSync, not by captureWindowBounds
        expect(console.error).toHaveBeenCalledWith(
            'Error updating session with sync:',
            expect.any(Error)
        );
    });

    test('clears previous debounce timer when new bounds captured', async () => {
        const testSession = { ...TEST_SESSION };
        spacesService.sessions.push(testSession);
        
        // Start first bounds capture
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, TEST_BOUNDS);
        
        // Advance time partway through debounce
        jest.advanceTimersByTime(500);
        
        // Capture new bounds (should reset timer)
        const newBounds = { left: 150, top: 250, width: 900, height: 700 };
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, newBounds);
        
        // Latest bounds should be in memory
        expect(testSession.windowBounds).toEqual(newBounds);
        
        // Advance another 500ms (total 1000ms since first, 500ms since second)
        jest.advanceTimersByTime(500);
        
        // Database should not be called yet (timer was reset)
        expect(dbService.updateSession).not.toHaveBeenCalled();
        
        // Advance another 500ms (now 1000ms since second capture)
        jest.advanceTimersByTime(500);
        await jest.runAllTimersAsync();
        
        // Now database should be called with the session containing latest bounds
        expect(dbService.updateSession).toHaveBeenCalledTimes(1);
        expect(dbService.updateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: TEST_SESSION.id,
                windowBounds: newBounds
            })
        );
    });

    test('waits for initialization before processing', async () => {
        // Reset the mock call count since ensureInitialized might be called in beforeEach
        spacesService.ensureInitialized.mockClear();
        
        await spacesService.captureWindowBounds(TEST_SESSION.windowId, TEST_BOUNDS);
        
        // ensureInitialized gets called twice: once in captureWindowBounds, once in getSessionByWindowId
        expect(spacesService.ensureInitialized).toHaveBeenCalledTimes(2);
    });
});