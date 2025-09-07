import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { mockConsole, mockDbUpdate } from './helpers.js';

describe('_updateSessionSync', () => {
    let originalUpdateSession;
    const EXISTING_SESSION = { id: 123, windowId: false, name: 'Old Name', tabs: [{ url: 'https://old.com' }], history: [] };
    const UPDATED_SESSION = { id: 123, windowId: 100, name: 'New Name', tabs: [{ url: 'https://new.com' }], history: [], lastAccess: new Date(), lastModified: new Date() };

    beforeEach(() => {
        // Reset sessions array and initialization state
        spacesService.sessions = [];
        spacesService.initialized = true;
        
        // Store original method
        originalUpdateSession = dbService.updateSession;
    });

    afterEach(() => {
        // Restore original method
        if (originalUpdateSession) {
            dbService.updateSession = originalUpdateSession;
        }
    });

    test('successfully updates session and syncs memory cache in place', async () => {
        const existingSession = structuredClone(EXISTING_SESSION);
        const updatedSession = { ...UPDATED_SESSION, lastModified: new Date() };

        // Add session to memory
        spacesService.sessions.push(existingSession);
        
        // Modify the session (simulating real usage)
        existingSession.windowId = 100;
        existingSession.name = 'New Name';
        
        // Mock successful database update
        let updateSessionCalled = false;
        let updateSessionArg = null;
        mockDbUpdate(async (session) => {
            updateSessionCalled = true;
            updateSessionArg = session;
            return updatedSession;
        });

        const result = await spacesService._updateSessionSync(existingSession);

        expect(updateSessionCalled).toBe(true);
        expect(updateSessionArg).toBe(existingSession);
        expect(result).toBe(spacesService.sessions[0]); // Returns the updated in-memory object
        expect(result.windowId).toBe(100); // Property was updated
        expect(result.name).toBe('New Name'); // Property was updated
        expect(result.lastModified).toBeDefined(); // Database properties merged
        expect(spacesService.sessions).toHaveLength(1);
        
        // Verify the original object was updated in place (reference preserved)
        expect(spacesService.sessions[0]).toBe(existingSession);
        expect(existingSession.lastModified).toBeDefined(); // Original object was updated
    });

    test('handles database update failure gracefully', async () => {
        const existingSession = structuredClone(EXISTING_SESSION);

        spacesService.sessions.push(existingSession);
        
        // Store original values
        const originalWindowId = existingSession.windowId;
        const originalName = existingSession.name;
        
        // Mock database failure
        mockDbUpdate(null);

        const result = await spacesService._updateSessionSync(existingSession);

        expect(result).toBeNull();
        
        // Memory cache should remain unchanged on failure
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions[0]).toBe(existingSession);
        // Original properties should remain (no sync occurred)
        expect(existingSession.windowId).toBe(originalWindowId);
        expect(existingSession.name).toBe(originalName);
    });

    test('handles database update exception gracefully', async () => {
        const existingSession = structuredClone(EXISTING_SESSION);

        spacesService.sessions.push(existingSession);
        
        // Mock database exception
        const dbError = new Error('Database update failed');
        mockDbUpdate(async () => {
            throw dbError;
        });

        // Spy on console.error to verify error handling
        const errorSpy = mockConsole('error');

        const result = await spacesService._updateSessionSync(existingSession);

        expect(result).toBeNull();
        expect(errorSpy.called).toBe(true);
        expect(errorSpy.args[0]).toBe('Error updating session with sync:');
        expect(errorSpy.args[1]).toBe(dbError);
        
        // Memory cache should remain unchanged on exception
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions[0]).toBe(existingSession);
    });

    test('handles session not found in memory cache by ID', async () => {
        const sessionToUpdate = structuredClone(UPDATED_SESSION);
        sessionToUpdate.id = 999; // ID not in memory cache

        const updatedSession = structuredClone(UPDATED_SESSION);
        updatedSession.id = 999;

        // Add a different session to memory cache
        spacesService.sessions.push(structuredClone(EXISTING_SESSION));
        
        // Mock successful database update
        mockDbUpdate(updatedSession);
        
        // Spy on console.warn to verify warning
        const warnSpy = mockConsole('warn');

        const result = await spacesService._updateSessionSync(sessionToUpdate);

        expect(result).toBe(updatedSession); // Returns database result directly
        expect(warnSpy.called).toBe(true);
        expect(warnSpy.args[0]).toBe('Session not found in memory cache during update sync');
        expect(spacesService.sessions).toHaveLength(1); // Cache unchanged
    });

    test('preserves object references for UI stability', async () => {
        const existingSession = structuredClone(EXISTING_SESSION);

        const updatedSession = structuredClone(UPDATED_SESSION);

        spacesService.sessions.push(existingSession);
        
        // Store reference to original object
        const originalRef = existingSession;
        const originalArrayRef = spacesService.sessions[0];
        
        mockDbUpdate(updatedSession);

        const result = await spacesService._updateSessionSync(existingSession);

        // Verify that references are preserved (critical for UI)
        expect(result).toBe(originalRef);
        expect(spacesService.sessions[0]).toBe(originalRef);
        expect(spacesService.sessions[0]).toBe(originalArrayRef);
        
        // But properties were updated
        expect(originalRef.windowId).toBe(UPDATED_SESSION.windowId);
        expect(originalRef.name).toBe(UPDATED_SESSION.name);
        expect(originalRef.lastAccess).toBeDefined();
    });

    test('finds correct session by ID in array with multiple sessions', async () => {
        const session1 = structuredClone(EXISTING_SESSION);
        session1.id = 111;
        session1.windowId = 100;
        session1.name = 'Session 1';
        
        const session2 = structuredClone(EXISTING_SESSION);
        session2.id = 222;
        session2.windowId = 200;
        session2.name = 'Session 2';
        
        const targetSession = structuredClone(EXISTING_SESSION);
        targetSession.id = 333;
        targetSession.windowId = 300;
        targetSession.name = 'Target';

        const updatedTargetSession = structuredClone(UPDATED_SESSION);
        updatedTargetSession.id = 333;
        updatedTargetSession.windowId = 300;
        updatedTargetSession.name = 'Updated Target';

        // Add multiple sessions
        spacesService.sessions.push(session1, session2, targetSession);
        
        mockDbUpdate(updatedTargetSession);

        const result = await spacesService._updateSessionSync(targetSession);

        expect(result).toBe(targetSession); // Correct session updated
        expect(spacesService.sessions).toHaveLength(3);
        expect(spacesService.sessions[0]).toBe(session1); // Others unchanged references
        expect(spacesService.sessions[1]).toBe(session2); // Others unchanged references
        expect(spacesService.sessions[2]).toBe(targetSession); // Target updated reference preserved
        expect(targetSession.name).toBe('Updated Target'); // Properties updated
        expect(targetSession.lastModified).toBeDefined(); // New properties added
    });

    test('handles windowId association changes correctly', async () => {
        const session = structuredClone(EXISTING_SESSION);

        const updatedSession = structuredClone(UPDATED_SESSION);

        spacesService.sessions.push(session);
        
        // Simulate matchSessionToWindow behavior  
        session.windowId = UPDATED_SESSION.windowId;
        
        mockDbUpdate(updatedSession);

        const result = await spacesService._updateSessionSync(session);

        expect(result).toBe(session);
        expect(session.windowId).toBe(100); // WindowId change preserved
        expect(session.lastAccess).toBeDefined(); // Database changes synced
    });

    test('handles complex object properties correctly', async () => {
        const session = {
            id: 123,
            windowId: 100,
            name: 'Test Session',
            tabs: [
                { url: 'https://example.com', title: 'Example', pinned: false },
                { url: 'https://test.com', title: 'Test', pinned: true }
            ],
            history: [
                { url: 'https://old.com', title: 'Old Page' }
            ]
        };

        const updatedSession = {
            id: 123,
            windowId: 100,
            name: 'Test Session',
            tabs: [
                { url: 'https://example.com', title: 'Updated Example', pinned: false },
                { url: 'https://test.com', title: 'Test', pinned: true },
                { url: 'https://new.com', title: 'New Page', pinned: false }
            ],
            history: [
                { url: 'https://old.com', title: 'Old Page' },
                { url: 'https://recent.com', title: 'Recent Page' }
            ],
            sessionHash: 98765,
            lastAccess: new Date()
        };

        spacesService.sessions.push(session);
        
        mockDbUpdate(updatedSession);

        const result = await spacesService._updateSessionSync(session);

        expect(result).toBe(session);
        expect(session.tabs).toHaveLength(3); // Tabs array updated
        expect(session.tabs[0].title).toBe('Updated Example'); // Nested properties updated
        expect(session.tabs[2].url).toBe('https://new.com'); // New items added
        expect(session.history).toHaveLength(2); // History updated
        expect(session.sessionHash).toBe(98765); // Computed properties synced
        expect(session.lastAccess).toBeDefined(); // Timestamps synced
    });
});
