import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { mockConsole, mockDbCreate } from './helpers.js';

describe('_createSessionSync - database creation with memory synchronization', () => {
    let originalCreateSession;
    const TEMP_SESSION = { id: false, windowId: 100, name: 'Test Session', tabs: [{ url: 'https://example.com' }], history: [] };
    const SAVED_SESSION = { id: 123, windowId: 100, name: 'Test Session', tabs: [{ url: 'https://example.com' }], history: [] };

    beforeEach(() => {
        // Reset sessions array and initialization state
        spacesService.sessions = [];
        spacesService.initialized = true;
        
        // Store original method
        originalCreateSession = dbService.createSession;
    });

    afterEach(() => {
        // Restore original method
        if (originalCreateSession) {
            dbService.createSession = originalCreateSession;
        }
    });

    test('successfully creates session and updates memory cache in place', async () => {
        const temporarySession = structuredClone(TEMP_SESSION);
        const savedSession = { ...SAVED_SESSION, createdAt: new Date(), lastAccess: new Date() };

        // Add session to memory first (simulating how saveNewSession works)
        spacesService.sessions.push(temporarySession);
        
        // Mock successful database creation
        let createSessionCalled = false;
        let createSessionArg = null;
        mockDbCreate(async (session) => {
            createSessionCalled = true;
            createSessionArg = session;
            return savedSession;
        });

        const result = await spacesService._createSessionSync(temporarySession);

        expect(createSessionCalled).toBe(true);
        expect(createSessionArg).toBe(temporarySession);
        expect(result).toBe(spacesService.sessions[0]); // Returns the updated in-memory object
        expect(result.id).toBe(123); // ID was assigned
        expect(result.createdAt).toBeDefined(); // Database properties merged
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions).toContain(temporarySession);
        
        // Verify the original object was updated in place (reference preserved)
        expect(spacesService.sessions).toContain(temporarySession);
        expect(temporarySession.id).toBe(123); // Original object was updated
    });

    test('handles database creation failure gracefully', async () => {
        const temporarySession = structuredClone(TEMP_SESSION);

        spacesService.sessions.push(temporarySession);
        
        // Mock database failure
        mockDbCreate(null);

        const result = await spacesService._createSessionSync(temporarySession);

        expect(result).toBeNull();
        
        // Memory cache should remain unchanged on failure
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions).toContain(temporarySession);
        expect(spacesService.sessions[0].id).toBe(false); // Still temporary
    });

    test('handles database creation exception gracefully', async () => {
        const temporarySession = structuredClone(TEMP_SESSION);

        spacesService.sessions.push(temporarySession);
        
        // Mock database exception
        const dbError = new Error('Database connection failed');
        mockDbCreate(async () => {
            throw dbError;
        });

        // Spy on console.error to verify error handling
        const errorSpy = mockConsole('error');

        const result = await spacesService._createSessionSync(temporarySession);

        expect(result).toBeNull();
        expect(errorSpy.called).toBe(true);
        expect(errorSpy.args[0]).toBe('Error creating session with sync:');
        expect(errorSpy.args[1]).toBe(dbError);
        
        // Memory cache should remain unchanged on exception
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions).toContain(temporarySession);
        expect(spacesService.sessions[0].id).toBe(false);

        errorSpy.restore();
    });

    test('handles session not found in memory cache', async () => {
        const temporarySession = structuredClone(TEMP_SESSION);
        const savedSession = structuredClone(SAVED_SESSION);

        // Don't add session to memory cache (unusual edge case)
        
        // Mock successful database creation
        mockDbCreate(savedSession);
        
        // Spy on console.warn to verify warning
        const warnSpy = mockConsole('warn');

        const result = await spacesService._createSessionSync(temporarySession);

        expect(result).toBe(savedSession); // Returns database result directly
        expect(warnSpy.called).toBe(true);
        expect(warnSpy.args[0]).toBe('Session not found in memory cache during create sync');
        expect(spacesService.sessions).toHaveLength(0);
        expect(spacesService.sessions).toEqual([]); // Cache unchanged and empty

        warnSpy.restore();
    });

    test('preserves object references for UI stability', async () => {
        const temporarySession = structuredClone(TEMP_SESSION);
        const savedSession = { ...SAVED_SESSION, createdAt: new Date() };

        spacesService.sessions.push(temporarySession);
        
        // Store reference to original object
        const originalRef = temporarySession;
        const originalArrayRef = spacesService.sessions[0];
        
        mockDbCreate(savedSession);

        const result = await spacesService._createSessionSync(temporarySession);

        // Verify that references are preserved (critical for UI)
        expect(result).toBe(originalRef);
        expect(spacesService.sessions).toContain(originalRef);
        expect(spacesService.sessions).toContain(originalArrayRef);
        
        // But properties were updated
        expect(originalRef.id).toBe(123);
        expect(originalRef.createdAt).toBeDefined();
    });

    test('handles multiple sessions in memory cache correctly', async () => {
        const session1 = { id: false, windowId: 100, name: 'Session 1', tabs: [] };
        const session2 = { id: false, windowId: 200, name: 'Session 2', tabs: [] };
        const targetSession = { id: false, windowId: 300, name: 'Target', tabs: [] };

        const savedSession = { id: 456, windowId: 300, name: 'Target', tabs: [] };

        // Add multiple sessions
        spacesService.sessions.push(session1, session2, targetSession);
        
        mockDbCreate(savedSession);

        const result = await spacesService._createSessionSync(targetSession);

        expect(result).toBe(targetSession); // Correct session updated
        expect(spacesService.sessions).toHaveLength(3);
        expect(spacesService.sessions).toEqual([session1, session2, targetSession]); // All sessions in correct order
        expect(targetSession.id).toBe(456); // Properly updated
    });
});
