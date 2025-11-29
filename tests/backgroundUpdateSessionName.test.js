/**
 * Unit tests for background.js handleUpdateSessionName functionality
 */

import { jest, setupTestMocks, mockConsole } from './helpers.js';
import { handleUpdateSessionName } from '../js/background/background.js';
import { dbService } from '../js/background/dbService.js';
import { spacesService } from '../js/background/spacesService.js';

// Setup all test mocks
setupTestMocks();

describe('background.js handleUpdateSessionName', () => {
    const SESSION_ID = 123;
    const NEW_NAME = 'New Name';

    let fetchSessionByNameSpy;
    let fetchSessionByIdSpy;
    let updateSessionNameSpy;
    let deleteSessionSpy;

    beforeEach(() => {
        jest.clearAllMocks();

        // Spy on service methods
        fetchSessionByNameSpy = jest.spyOn(dbService, 'fetchSessionByName');
        fetchSessionByIdSpy = jest.spyOn(dbService, 'fetchSessionById');
        updateSessionNameSpy = jest.spyOn(spacesService, 'updateSessionName');
        deleteSessionSpy = jest.spyOn(spacesService, 'deleteSession');

        // Default: no existing session with that name
        fetchSessionByNameSpy.mockResolvedValue(false);
        // Default: update succeeds
        updateSessionNameSpy.mockResolvedValue({ id: SESSION_ID, name: NEW_NAME });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('updates name if no conflict exists', async () => {
        const result = await handleUpdateSessionName(SESSION_ID, NEW_NAME, false);

        expect(fetchSessionByNameSpy).toHaveBeenCalledWith(NEW_NAME);
        expect(updateSessionNameSpy).toHaveBeenCalledWith(SESSION_ID, NEW_NAME);
        expect(result).toEqual({ id: SESSION_ID, name: NEW_NAME });
    });

    test('updates name if conflict exists but IDs match (case change)', async () => {
        // Conflict with SAME session ID (e.g. "name" -> "Name")
        fetchSessionByNameSpy.mockResolvedValue({
            id: SESSION_ID, // Same ID
            name: NEW_NAME.toLowerCase()
        });

        const result = await handleUpdateSessionName(SESSION_ID, NEW_NAME, false);

        // Should NOT try to delete itself
        expect(deleteSessionSpy).not.toHaveBeenCalled();

        // Should proceed with update
        expect(updateSessionNameSpy).toHaveBeenCalledWith(SESSION_ID, NEW_NAME);
        expect(result).toEqual({ id: SESSION_ID, name: NEW_NAME });
    });

    test('fails if conflict exists with different ID and deleteOld is false', async () => {
        // Conflict with DIFFERENT session ID
        fetchSessionByNameSpy.mockResolvedValue({
            id: 999, // Different ID
            name: NEW_NAME
        });

        const errorSpy = mockConsole('error');

        const result = await handleUpdateSessionName(SESSION_ID, NEW_NAME, false);

        expect(result).toBe(false);
        expect(fetchSessionByNameSpy).toHaveBeenCalledWith(NEW_NAME);
        expect(updateSessionNameSpy).not.toHaveBeenCalled();
        expect(deleteSessionSpy).not.toHaveBeenCalled();

        // Verify console.error was called
        expect(errorSpy.called).toBe(true);
        expect(errorSpy.args[0]).toContain('Session with name "New Name" already exists');

        errorSpy.restore();
    });

    test('deletes old session if conflict exists with different ID and deleteOld is true', async () => {
        // Conflict with DIFFERENT session ID
        fetchSessionByNameSpy.mockResolvedValue({
            id: 999, // Different ID
            name: NEW_NAME
        });

        // Mock fetchSessionById for deleteSession
        fetchSessionByIdSpy.mockResolvedValue({ id: 999 });
        deleteSessionSpy.mockResolvedValue(true);

        const result = await handleUpdateSessionName(SESSION_ID, NEW_NAME, true);

        // Should delete the conflicting session
        expect(deleteSessionSpy).toHaveBeenCalledWith(999);

        // Should proceed with update
        expect(updateSessionNameSpy).toHaveBeenCalledWith(SESSION_ID, NEW_NAME);
        expect(result).toEqual({ id: SESSION_ID, name: NEW_NAME });
    });
});
