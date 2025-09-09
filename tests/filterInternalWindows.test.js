/**
 * @jest-environment node
 */

import { filterInternalWindows } from '../js/background/spacesService.js';
import { setupMinimalChromeMocks } from './helpers.js';

// Setup minimal Chrome mocks for testing
setupMinimalChromeMocks();

describe('filterInternalWindows', () => {
    describe('normal windows (should not be filtered)', () => {
        test('should not filter normal windows with regular websites', () => {
            // Single tab
            const tabWindow = {
                tabs: [{ url: 'https://example.com' }],
                type: 'normal'
            };
            expect(filterInternalWindows(tabWindow)).toBe(false);

            // Multiple tabs
            tabWindow.tabs.push({ url: 'https://example.com' });
            expect(filterInternalWindows(tabWindow)).toBe(false);
        });

        test('should not filter window with extension URL among other tabs', () => {
            const window = {
                tabs: [
                    { url: 'https://example.com' },
                    { url: `chrome-extension://${chrome.runtime.id}/spaces.html` }
                ],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(false);
        });
    });

    describe('internal extension windows (should be filtered)', () => {
        test('should filter window with single tab containing extension URL', () => {
            const window = {
                tabs: [{ url: `chrome-extension://${chrome.runtime.id}/spaces.html` }],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });

        test('should filter window with single tab containing extension popup', () => {
            const window = {
                tabs: [{ url: `chrome-extension://${chrome.runtime.id}/popup.html` }],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });

        test('should filter window with single tab containing any extension page', () => {
            const window = {
                tabs: [{ url: `chrome-extension://${chrome.runtime.id}/any-page.html?param=value` }],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });
    });

    describe('popup and panel windows (should be filtered)', () => {
        test('should filter popup window type', () => {
            const window = {
                tabs: [{ url: 'https://example.com' }],
                type: 'popup'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });

        test('should filter panel window type', () => {
            const window = {
                tabs: [{ url: 'https://example.com' }],
                type: 'panel'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });

        test('should filter popup window even with multiple tabs', () => {
            const window = {
                tabs: [
                    { url: 'https://example.com' },
                    { url: 'https://google.com' }
                ],
                type: 'popup'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });
    });

    describe('edge cases', () => {
        test('should not filter window with empty tabs array', () => {
            const window = {
                tabs: [],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(false);
        });

        test('should handle different extension IDs correctly', () => {
            const window = {
                tabs: [{ url: 'chrome-extension://different-extension-id/page.html' }],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(false);
        });

        test('should handle partial matches in URL (possible bug)', () => {
            // NOTE: This tests current behavior but may be unintended.
            // The function uses indexOf() which matches extension ID anywhere in the URL,
            // not just in proper chrome-extension:// URLs
            const window = {
                tabs: [{ url: `https://example.com/page-${chrome.runtime.id}` }],
                type: 'normal'
            };
            expect(filterInternalWindows(window)).toBe(true);
        });

        test('should handle undefined window type', () => {
            const window = {
                tabs: [{ url: 'https://example.com' }]
                // type is undefined
            };
            expect(filterInternalWindows(window)).toBe(false);
        });
    });

    describe('chrome-specific window types', () => {
        test('should not filter app window type', () => {
            const window = {
                tabs: [{ url: 'https://example.com' }],
                type: 'app'
            };
            expect(filterInternalWindows(window)).toBe(false);
        });

        test('should not filter devtools window type', () => {
            const window = {
                tabs: [{ url: 'devtools://devtools/bundled/inspector.html' }],
                type: 'devtools'
            };
            expect(filterInternalWindows(window)).toBe(false);
        });
    });
});
