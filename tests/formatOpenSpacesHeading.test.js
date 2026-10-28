/**
 * Unit tests for formatOpenSpacesHeading in js/spaces.js
 */
import { setupTestMocks } from './helpers.js';
import { formatOpenSpacesHeading } from '../js/spaces.js';

setupTestMocks();

describe('formatOpenSpacesHeading', () => {
    test('pluralizes tabs and windows', () => {
        expect(formatOpenSpacesHeading(2, 5)).toBe('Open Spaces (5 tabs across 2 windows)');
    });

    test('uses singular for one tab and one window', () => {
        expect(formatOpenSpacesHeading(1, 1)).toBe('Open Spaces (1 tab across 1 window)');
    });

    test('pluralizes tabs and windows independently', () => {
        expect(formatOpenSpacesHeading(2, 1)).toBe('Open Spaces (1 tab across 2 windows)');
        expect(formatOpenSpacesHeading(1, 3)).toBe('Open Spaces (3 tabs across 1 window)');
    });

    test('handles zero counts', () => {
        expect(formatOpenSpacesHeading(0, 0)).toBe('Open Spaces (0 tabs across 0 windows)');
    });
});
