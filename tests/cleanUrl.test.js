/**
 * @jest-environment node
 */

import { cleanUrl } from '../js/background/spacesService.js';
import { setupMinimalChromeMocks } from './helpers.js';

// Setup minimal Chrome mocks for testing
setupMinimalChromeMocks();

describe('cleanUrl', () => {
    describe('basic functionality', () => {
        test('should return empty string for null input', () => {
            expect(cleanUrl(null)).toBe('');
        });

        test('should return empty string for undefined input', () => {
            expect(cleanUrl(undefined)).toBe('');
        });

        test('should return empty string for empty string', () => {
            expect(cleanUrl('')).toBe('');
        });

        test('should return clean URL unchanged', () => {
            const url = 'https://example.com/page';
            expect(cleanUrl(url)).toBe(url);
        });
    });

    describe('query parameter removal', () => {
        test('should remove single query parameter', () => {
            const url = 'https://example.com/page?param=value';
            expect(cleanUrl(url)).toBe('https://example.com/page');
        });

        test('should remove multiple query parameters', () => {
            const url = 'https://example.com/page?param=value&other=test&third=123';
            expect(cleanUrl(url)).toBe('https://example.com/page');
        });
    });

    describe('hash fragment removal', () => {
        test('should remove hash fragments', () => {
            const url = 'https://example.com/page#section';
            expect(cleanUrl(url)).toBe('https://example.com/page');
        });

        test('should remove complex hash fragments', () => {
            const url = 'https://example.com/page#section-with-dashes_and_underscores';
            expect(cleanUrl(url)).toBe('https://example.com/page');
        });
    });

    describe('combined query and hash removal', () => {
        test('should remove both query parameters and hash fragments', () => {
            const url = 'https://example.com/page?param=value#section';
            expect(cleanUrl(url)).toBe('https://example.com/page');
        });

        test('should handle complex combinations', () => {
            const url = 'https://example.com/page?a=1&b=2&c=3#complex-hash';
            expect(cleanUrl(url)).toBe('https://example.com/page');
        });
    });

    describe('extension URL filtering', () => {
        test('should return empty string for extension URLs', () => {
            const url = `chrome-extension://${chrome.runtime.id}/popup.html`;
            expect(cleanUrl(url)).toBe('');
        });

        test('should return empty string for extension URLs with query params', () => {
            const url = `chrome-extension://${chrome.runtime.id}/popup.html?param=value`;
            expect(cleanUrl(url)).toBe('');
        });
    });

    describe('new tab page filtering', () => {
        test('should return empty string for new tab pages', () => {
            const url = 'chrome:// newtab/';
            expect(cleanUrl(url)).toBe('');
        });
    });

    describe('The Great Suspender support', () => {
        test('should extract URI from Great Suspender URLs', () => {
            const suspendedUrl = 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#ttl=test&pos=0&uri=https://example.com/page';
            expect(cleanUrl(suspendedUrl)).toBe('https://example.com/page');
        });

        test('should extract URI with query params from Great Suspender URLs', () => {
            const suspendedUrl = 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#ttl=test&pos=0&uri=https://example.com/page?param=value';
            expect(cleanUrl(suspendedUrl)).toBe('https://example.com/page');
        });

        test('should handle malformed Great Suspender URLs gracefully', () => {
            const malformedUrl = 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#ttl=test&pos=0';
            expect(cleanUrl(malformedUrl)).toBe('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html');
        });
    });

    describe('edge cases', () => {
        test('should handle URLs with only hash', () => {
            const url = 'https://example.com/#anchor';
            expect(cleanUrl(url)).toBe('https://example.com/');
        });

        test('should handle URLs with only query', () => {
            const url = 'https://example.com/?query=test';
            expect(cleanUrl(url)).toBe('https://example.com/');
        });

        test('should handle URLs with trailing slash', () => {
            const url = 'https://example.com/';
            expect(cleanUrl(url)).toBe('https://example.com/');
        });

        test('should handle localhost URLs', () => {
            const url = 'http://localhost:3000/page?debug=true#section';
            expect(cleanUrl(url)).toBe('http://localhost:3000/page');
        });

        test('should handle file URLs', () => {
            const url = 'file:///path/to/file.html?param=value';
            expect(cleanUrl(url)).toBe('file:///path/to/file.html');
        });
    });
});
