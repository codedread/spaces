import { isFileUrl } from '../js/common.js';

describe('isFileUrl', () => {
    test('returns true for file: URLs', () => {
        expect(isFileUrl('file:///home/me/doc.pdf')).toBe(true);
        expect(isFileUrl('file://server/share/doc.pdf')).toBe(true);
    });

    test('is case-insensitive about the scheme', () => {
        expect(isFileUrl('FILE:///C:/doc.pdf')).toBe(true);
    });

    test('returns false for other URLs', () => {
        expect(isFileUrl('https://example.com/file:///x')).toBe(false);
        expect(isFileUrl('data:text/html,file:')).toBe(false);
        expect(isFileUrl('chrome://newtab/')).toBe(false);
    });

    test('returns false for non-strings', () => {
        expect(isFileUrl(null)).toBe(false);
        expect(isFileUrl(undefined)).toBe(false);
        expect(isFileUrl('')).toBe(false);
        expect(isFileUrl(42)).toBe(false);
    });
});
