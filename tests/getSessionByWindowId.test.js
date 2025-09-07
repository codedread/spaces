import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';

describe('getSessionByWindowId - session retrieval logic', () => {
    let originalFetchSessionByWindowId;

    beforeEach(() => {
        // Reset sessions array
        spacesService.sessions = [];
        spacesService.initialized = true;
        
        // Mock database method to prevent indexedDB errors in tests
        originalFetchSessionByWindowId = dbService.fetchSessionByWindowId;
        dbService.fetchSessionByWindowId = async () => null;
    });

    afterEach(() => {
        // Restore original method
        if (originalFetchSessionByWindowId) {
            dbService.fetchSessionByWindowId = originalFetchSessionByWindowId;
        }
    });

    test('retrieves sessions by windowId and distinguishes types', async () => {
        const tempSession = {
            id: false, // temporary
            windowId: 100,
            name: false,
            tabs: [{ url: 'https://temp.com' }]
        };

        const savedSession = {
            id: 123, // saved
            windowId: 200,
            name: 'Saved Session',
            tabs: [{ url: 'https://saved.com' }]
        };

        spacesService.sessions.push(tempSession, savedSession);

        // Test retrieval and type identification
        const foundTemp = await spacesService.getSessionByWindowId(100);
        expect(foundTemp).toBe(tempSession);
        expect(foundTemp.id).toBe(false); // temporary session
        expect(typeof foundTemp.id).toBe('boolean');

        const foundSaved = await spacesService.getSessionByWindowId(200);
        expect(foundSaved).toBe(savedSession);  
        expect(foundSaved.id).toBe(123); // saved session
        expect(typeof foundSaved.id).toBe('number');
    });

    test('returns null when no session exists for windowId', async () => {
        // No sessions exist
        expect(spacesService.sessions).toHaveLength(0);

        const noSession = await spacesService.getSessionByWindowId(999);
        expect(noSession).toBe(null);
    });
});
