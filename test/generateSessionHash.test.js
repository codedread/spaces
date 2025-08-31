/**
 * @jest-environment node
 */

import { generateSessionHash } from '../js/background/spacesService.js';

// Mock chrome.runtime.id for testing
global.chrome = {
    runtime: {
        id: 'test-extension-id-12345'
    }
};

describe('generateSessionHash', () => {
    describe('deterministic behavior', () => {
        test('should return same hash for identical input', () => {
            const tabs = [
                { url: 'https://example.com' },
                { url: 'https://google.com' }
            ];
            
            const hash1 = generateSessionHash(tabs);
            const hash2 = generateSessionHash(tabs);
            
            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('number');
            expect(hash1).toBeGreaterThan(0);
        });

        test('should return same hash when called multiple times with same data', () => {
            const tabs = [{ url: 'https://example.com/page' }];
            
            const hashes = [];
            for (let i = 0; i < 5; i++) {
                hashes.push(generateSessionHash(tabs));
            }
            
            // All hashes should be identical
            expect(new Set(hashes).size).toBe(1);
        });
    });

    describe('hash uniqueness', () => {
        test('should return different hashes for different tab sets', () => {
            const tabs1 = [{ url: 'https://example.com' }];
            const tabs2 = [{ url: 'https://google.com' }];
            
            const hash1 = generateSessionHash(tabs1);
            const hash2 = generateSessionHash(tabs2);
            
            expect(hash1).not.toBe(hash2);
        });

        test('should return different hashes for different number of tabs', () => {
            const tabs1 = [{ url: 'https://example.com' }];
            const tabs2 = [
                { url: 'https://example.com' },
                { url: 'https://google.com' }
            ];
            
            expect(generateSessionHash(tabs1)).not.toBe(generateSessionHash(tabs2));
        });

        test('should return different hashes for same tabs in different order', () => {
            const tabs1 = [
                { url: 'https://example.com' },
                { url: 'https://google.com' }
            ];
            const tabs2 = [
                { url: 'https://google.com' },
                { url: 'https://example.com' }
            ];
            
            expect(generateSessionHash(tabs1)).not.toBe(generateSessionHash(tabs2));
        });
    });

    describe('edge cases', () => {
        test('should handle empty tabs array', () => {
            const hash = generateSessionHash([]);
            expect(hash).toBe(0);
            expect(typeof hash).toBe('number');
        });

        test('should handle tabs with no url property', () => {
            const tabs = [
                { title: 'Some tab without URL' },
                { url: undefined },
                { url: null }
            ];
            
            // Should not crash and should return 0 since no valid URLs
            expect(generateSessionHash(tabs)).toBe(0);
        });

        test('should handle tabs with empty URL strings', () => {
            const tabs = [
                { url: '' },
                { url: '   ' },
                { url: 'https://example.com' }
            ];
            
            const hash = generateSessionHash(tabs);
            expect(typeof hash).toBe('number');
            expect(hash).toBeGreaterThan(0);
        });
    });

    describe('integration with cleanUrl', () => {
        test('should use cleanUrl for processing URLs', () => {
            const tabs1 = [{ url: 'https://example.com?param=value#hash' }];
            const tabs2 = [{ url: 'https://example.com' }];
            
            // Should be same hash because cleanUrl removes query and hash
            expect(generateSessionHash(tabs1)).toBe(generateSessionHash(tabs2));
        });

        test('should handle tabs with URLs that get filtered out by cleanUrl', () => {
            const tabs = [
                { url: 'chrome-extension://test-extension-id-12345/popup.html' },
                { url: 'chrome:// newtab/' }
            ];
            
            // All URLs get filtered by cleanUrl, so hash should be 0
            expect(generateSessionHash(tabs)).toBe(0);
        });

        test('should handle mixed filtered and valid URLs', () => {
            const tabs1 = [
                { url: 'https://example.com' },
                { url: 'chrome-extension://test-extension-id-12345/popup.html' },
                { url: 'https://google.com' }
            ];
            
            const tabs2 = [
                { url: 'https://example.com' },
                { url: 'https://google.com' }
            ];
            
            // Should be same hash since filtered URLs are ignored
            expect(generateSessionHash(tabs1)).toBe(generateSessionHash(tabs2));
        });

        test('should handle Great Suspender URLs correctly', () => {
            const tabs1 = [{ 
                url: 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#ttl=test&pos=0&uri=https://example.com'
            }];
            const tabs2 = [{ url: 'https://example.com' }];
            
            // Should be same hash because cleanUrl extracts the real URL from Great Suspender
            expect(generateSessionHash(tabs1)).toBe(generateSessionHash(tabs2));
        });
    });

    describe('hash properties', () => {
        test('should always return positive integers', () => {
            const testCases = [
                [{ url: 'https://example.com' }],
                [{ url: 'https://google.com' }, { url: 'https://github.com' }],
                [{ url: 'http://localhost:3000' }],
                [{ url: 'https://very-long-domain-name-that-might-cause-issues.com/with/long/path/segments' }]
            ];
            
            testCases.forEach(tabs => {
                const hash = generateSessionHash(tabs);
                expect(hash).toBeGreaterThan(0);
                expect(Number.isInteger(hash)).toBe(true);
            });
        });

        test('should handle unicode characters in URLs', () => {
            const tabs = [{ url: 'https://example.com/café/naïve' }];
            const hash = generateSessionHash(tabs);
            
            expect(typeof hash).toBe('number');
            expect(hash).toBeGreaterThan(0);
            expect(Number.isInteger(hash)).toBe(true);
        });

        test('should be consistent across different execution contexts', () => {
            // Test with a variety of URLs to ensure algorithm stability
            const tabs = [
                { url: 'https://example.com' },
                { url: 'https://www.google.com/search?q=test' },
                { url: 'https://github.com/user/repo/issues/123' }
            ];
            
            const hash1 = generateSessionHash(tabs);
            const hash2 = generateSessionHash(JSON.parse(JSON.stringify(tabs))); // Deep copy
            
            expect(hash1).toBe(hash2);
        });
    });

    describe('known values for regression testing', () => {
        test('should generate expected hash for simple known input', () => {
            // This test helps catch unintended changes to the algorithm
            const tabs = [{ url: 'https://example.com' }];
            const hash = generateSessionHash(tabs);
            
            // Regression test - this specific input should always produce the same hash
            expect(hash).toBe(632849614);
            expect(typeof hash).toBe('number');
            expect(hash).toBeGreaterThan(0);
        });
    });
});
