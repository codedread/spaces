import { spacesService } from '../js/background/spacesService.js';

describe('_addSessionSafely', () => {
    beforeEach(() => {
        // Reset sessions array before each test
        spacesService.sessions = [];
    });

    test('adds new temporary session successfully', () => {
        const newSession = {
            id: false,
            windowId: 100,
            name: false,
            tabs: [{ url: 'https://example.com' }]
        };

        const result = spacesService._addSessionSafely(newSession);
        
        expect(result).toBe(true);
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions[0]).toEqual(newSession);
    });

    test('prevents duplicate temporary sessions by windowId', () => {
        const existingSession = {
            id: false,
            windowId: 100,
            name: false,
            tabs: [{ url: 'https://example.com' }]
        };
        
        const duplicateSession = {
            id: false,
            windowId: 100,
            name: 'Different name',
            tabs: [{ url: 'https://different.com' }]
        };

        // Add first session
        spacesService.sessions.push(existingSession);

        // Try to add duplicate
        const result = spacesService._addSessionSafely(duplicateSession);

        expect(result).toBe(false);
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions[0]).toEqual(existingSession);
    });

    test('allows multiple temporary sessions with different windowIds', () => {
        const session1 = {
            id: false,
            windowId: 100,
            name: false,
            tabs: [{ url: 'https://example.com' }]
        };
        
        const session2 = {
            id: false,
            windowId: 200,
            name: false,
            tabs: [{ url: 'https://different.com' }]
        };

        const result1 = spacesService._addSessionSafely(session1);
        const result2 = spacesService._addSessionSafely(session2);

        expect(result1).toBe(true);
        expect(result2).toBe(true);
        expect(spacesService.sessions).toHaveLength(2);
    });

    test('prevents duplicate sessions by windowId regardless of session type', () => {
        const existingSession = {
            id: false,
            windowId: 100,
            name: false,
            tabs: [{ url: 'https://example.com' }]
        };
        
        const savedSession = {
            id: 1,
            windowId: 100, // Same windowId as temporary session
            name: 'Saved Session',
            tabs: [{ url: 'https://saved.com' }]
        };

        spacesService.sessions.push(existingSession);
        const result = spacesService._addSessionSafely(savedSession);

        expect(result).toBe(false);
        expect(spacesService.sessions).toHaveLength(1);
        expect(spacesService.sessions[0]).toEqual(existingSession);
    });

    test('allows saved sessions with different windowIds', () => {
        const existingSession = {
            id: false,
            windowId: 100,
            name: false,
            tabs: [{ url: 'https://example.com' }]
        };
        
        const savedSession = {
            id: 1,
            windowId: 200, // Different windowId
            name: 'Saved Session',
            tabs: [{ url: 'https://saved.com' }]
        };

        spacesService.sessions.push(existingSession);
        const result = spacesService._addSessionSafely(savedSession);

        expect(result).toBe(true);
        expect(spacesService.sessions).toHaveLength(2);
    });

    test('allows temporary sessions without windowId', () => {
        const session1 = {
            id: false,
            windowId: false,
            name: false,
            tabs: [{ url: 'https://example.com' }]
        };
        
        const session2 = {
            id: false,
            windowId: false,
            name: false,
            tabs: [{ url: 'https://different.com' }]
        };

        const result1 = spacesService._addSessionSafely(session1);
        const result2 = spacesService._addSessionSafely(session2);

        expect(result1).toBe(true);
        expect(result2).toBe(true);
        expect(spacesService.sessions).toHaveLength(2);
    });
});
