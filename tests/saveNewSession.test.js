import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { jest, setupMinimalChromeMocks } from './helpers.js';

describe('saveNewSession', () => {
    describe('window bounds handling', () => {
        let originalCreateSession;
        const TEST_SESSION_ID = 123;
        const TEST_WINDOW_ID = 456;
        const TEST_BOUNDS = {
            left: 100,
            top: 200, 
            width: 800,
            height: 600
        };
        const TEST_TABS = [{ url: 'https://example.com' }];

        // Helper function to create a session and verify basic success properties
        const createSessionAndVerifyBasics = async (name, bounds, tabs = TEST_TABS) => {
            const result = await spacesService.saveNewSession(name, tabs, TEST_WINDOW_ID, bounds);
            expect(result).toBeTruthy();
            expect(result.id).toBe(TEST_SESSION_ID);
            
            // Verify database call arguments
            const createCall = dbService.createSession.mock.calls[0][0];
            expect(createCall.name).toBe(name);
            expect(createCall.tabs).toEqual(tabs);
            expect(createCall.windowId).toBe(TEST_WINDOW_ID);
            
            return { result, createCall };
        };

        beforeEach(() => {
            // Setup Chrome API mocks
            setupMinimalChromeMocks();
            
            // Reset spacesService state
            spacesService.sessions = [];
            spacesService.initialized = true;
            
            // Store original method and mock dbService
            originalCreateSession = dbService.createSession;
            dbService.createSession = jest.fn().mockImplementation(async (session) => {
                // Return the session that was passed in with an ID (simulating successful creation)
                return {
                    ...session,
                    id: TEST_SESSION_ID,
                    createdAt: new Date(),
                    lastAccess: new Date()
                };
            });
            
            // Mock console to suppress debug output during tests
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            // Restore original methods
            if (originalCreateSession) {
                dbService.createSession = originalCreateSession;
            }
            jest.restoreAllMocks();
        });

        test('saves window bounds when provided to saveNewSession', async () => {
            const { result, createCall } = await createSessionAndVerifyBasics('Test Session', TEST_BOUNDS);
            
            expect(result.windowBounds).toEqual(TEST_BOUNDS);
            expect(createCall.windowBounds).toEqual(TEST_BOUNDS);
        });

        test('saves session without bounds when not provided', async () => {
            const { createCall } = await createSessionAndVerifyBasics('Test Session');
            
            expect(createCall.windowBounds).toBeUndefined();
        });

        test('applies bounds to existing temporary session', async () => {
            // Create temporary session first
            const tempSession = {
                id: false,
                windowId: TEST_WINDOW_ID,
                history: [],
                name: false,
                tabs: [{ url: 'https://temp.com' }]
            };
            spacesService.sessions.push(tempSession);
            
            // Mock getSessionByWindowId to return the temp session
            jest.spyOn(spacesService, 'getSessionByWindowId').mockResolvedValue(tempSession);
            
            const { result, createCall } = await createSessionAndVerifyBasics(
                'Test Session',
                TEST_BOUNDS
            );
            
            expect(result.windowBounds).toEqual(TEST_BOUNDS);
            expect(createCall.windowBounds).toEqual(TEST_BOUNDS);
        });

        test('handles null and undefined bounds parameters gracefully', async () => {
            // Test null bounds - call directly since we expect success
            const result1 = await spacesService.saveNewSession(
                'Test Session',
                TEST_TABS,
                TEST_WINDOW_ID,
                null
            );
            expect(result1).toBeTruthy();
            expect(result1.id).toBe(TEST_SESSION_ID);
            
            // Reset mocks between calls
            jest.clearAllMocks();
            dbService.createSession.mockImplementation(async (session) => {
                return {
                    ...session,
                    id: TEST_SESSION_ID,
                    createdAt: new Date(),
                    lastAccess: new Date()
                };
            });
            
            // Test undefined bounds - call directly since we expect success  
            const result2 = await spacesService.saveNewSession(
                'Test Session 2',
                TEST_TABS,
                TEST_WINDOW_ID + 1, // Use different window ID
                undefined
            );
            expect(result2).toBeTruthy();
            expect(result2.id).toBe(TEST_SESSION_ID);
            
            // Both should not set windowBounds
            const calls = dbService.createSession.mock.calls;
            expect(calls.length).toBeGreaterThan(0); // Ensure we have calls
            expect(calls[0][0].windowBounds).toBeUndefined();
        });

        test('preserves other session properties when adding bounds', async () => {
            const { createCall } = await createSessionAndVerifyBasics('Test Session', TEST_BOUNDS);
            
            // Verify bounds and additional properties that aren't checked by the helper
            expect(createCall.windowBounds).toEqual(TEST_BOUNDS);
            expect(createCall.history).toEqual(expect.any(Array));
            expect(createCall.lastAccess).toEqual(expect.any(Date));
            expect(createCall.sessionHash).toEqual(expect.any(Number));
        });

        test('returns null when tabs parameter is missing', async () => {
            const result = await spacesService.saveNewSession(
                'Test Session',
                null, // No tabs
                TEST_WINDOW_ID,
                TEST_BOUNDS
            );
            
            expect(result).toBeNull();
            expect(dbService.createSession).not.toHaveBeenCalled();
        });
    });
});
