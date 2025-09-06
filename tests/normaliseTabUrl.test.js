/**
 * @jest-environment node
 */

import { normaliseTabUrl } from '../js/spaces.js';

describe('normaliseTabUrl', () => {
    describe('normal URLs (should remain unchanged)', () => {
        test('should return regular URLs unchanged', () => {
            expect(normaliseTabUrl('https://example.com')).toBe('https://example.com');
            expect(normaliseTabUrl('https://example.com#section')).toBe('https://example.com#section');
            expect(normaliseTabUrl('chrome://settings/')).toBe('chrome://settings/');
        });
    });

    describe('Great Suspender URLs (should be normalized)', () => {
        test('should extract original URL from suspended.html with uri parameter', () => {
            const suspendedUrl = 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=https://example.com';
            expect(normaliseTabUrl(suspendedUrl)).toBe('https://example.com');
        });

        test('should handle complex URLs and different extension IDs', () => {
            const complexUrl = 'chrome-extension://different-id/suspended.html?title=Test&uri=https://docs.example.com/api/v1/users?sort=name&page=5#results';
            expect(normaliseTabUrl(complexUrl)).toBe('https://docs.example.com/api/v1/users?sort=name&page=5#results');
        });
    });

    describe('edge cases', () => {
        test('should require both suspended.html and uri parameter', () => {
            expect(normaliseTabUrl('chrome-extension://abc/suspended.html#title=Something')).toBe('chrome-extension://abc/suspended.html#title=Something');
            expect(normaliseTabUrl('https://example.com/page.html#uri=https://other.com')).toBe('https://example.com/page.html#uri=https://other.com');
        });

        test('should require suspended.html not at beginning (indexOf > 0)', () => {
            expect(normaliseTabUrl('suspended.html#uri=https://example.com')).toBe('suspended.html#uri=https://example.com');
        });

        test('should extract from first uri parameter when multiple exist', () => {
            const url = 'chrome-extension://abc/suspended.html#uri=https://first.com&other=param&uri=https://second.com';
            expect(normaliseTabUrl(url)).toBe('https://first.com&other=param&uri=https://second.com');
        });
    });

    describe('invalid inputs', () => {
        test('should handle edge case inputs', () => {
            expect(normaliseTabUrl('')).toBe('');
            expect(() => normaliseTabUrl(null)).toThrow();
            expect(() => normaliseTabUrl(123)).toThrow('url.indexOf is not a function');
            expect(normaliseTabUrl([])).toEqual([]); // Arrays have indexOf
        });
    });
});
