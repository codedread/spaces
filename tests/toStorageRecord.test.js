import { dbService, toStorageRecord } from '../js/background/dbService.js';
import { toFileUrlPlaceholder } from '../js/common.js';
import { jest } from './helpers.js';

const FILE_URL = 'file:///home/me/doc.pdf';
const PLACEHOLDER = toFileUrlPlaceholder(FILE_URL);

function makeSession() {
    return {
        id: 5,
        windowId: 100,
        name: 'Work',
        sessionHash: 1234,
        tabs: [{ url: 'https://example.com' }, { url: FILE_URL, title: 'doc.pdf' }],
        history: [{ url: FILE_URL, title: 'doc.pdf' }],
    };
}

describe('toStorageRecord', () => {
    test('replaces file: URLs in tabs and history', () => {
        const record = toStorageRecord(makeSession());
        expect(record.tabs.map(t => t.url)).toEqual(['https://example.com', PLACEHOLDER]);
        expect(record.history[0].url).toBe(PLACEHOLDER);
    });

    test('keeps the sessionHash and other fields, and does not modify the input', () => {
        const session = makeSession();
        const record = toStorageRecord(session);
        expect(record).toMatchObject({ id: 5, windowId: 100, name: 'Work', sessionHash: 1234 });
        expect(session).toEqual(makeSession());
    });

    test('handles a session with no history', () => {
        const record = toStorageRecord({ ...makeSession(), history: false });
        expect(record.history).toBe(false);
    });

    describe('is used by dbService writes', () => {
        let originalGetDb;
        let server;

        beforeEach(() => {
            originalGetDb = dbService._getDb;
            server = {
                add: jest.fn(async (_store, record) => [{ ...record, id: 9 }]),
                update: jest.fn(async (_store, record) => [record]),
            };
            dbService._getDb = async () => server;
        });

        afterEach(() => {
            dbService._getDb = originalGetDb;
        });

        test('createSession stores placeholders', async () => {
            const result = await dbService.createSession(makeSession());
            const stored = server.add.mock.calls[0][1];
            expect(stored.id).toBeUndefined();
            expect(stored.tabs[1].url).toBe(PLACEHOLDER);
            expect(stored.history[0].url).toBe(PLACEHOLDER);
            expect(result.id).toBe(9);
        });

        test('updateSession stores placeholders', async () => {
            await dbService.updateSession(makeSession());
            const stored = server.update.mock.calls[0][1];
            expect(stored.tabs[1].url).toBe(PLACEHOLDER);
            expect(stored.history[0].url).toBe(PLACEHOLDER);
            expect(stored.sessionHash).toBe(1234);
        });
    });
});
