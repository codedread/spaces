/**
 * @jest-environment node
 */

import { cleanParameter } from '../js/background/background.js';

describe('cleanParameter', () => {
    describe('number inputs', () => {
        test('should return numbers unchanged', () => {
            expect(cleanParameter(42)).toBe(42);
            expect(cleanParameter(0)).toBe(0);
            expect(cleanParameter(-5)).toBe(-5);
            expect(cleanParameter(3.14)).toBe(3.14);
        });
    });

    describe('boolean string inputs', () => {
        test('should convert boolean strings to boolean values', () => {
            expect(cleanParameter('false')).toBe(false);
            expect(cleanParameter('true')).toBe(true);
        });

        test('should be case-sensitive for boolean strings', () => {
            // These should not be treated as booleans
            expect(cleanParameter('False')).toBe(NaN);
        });
    });

    describe('numeric string inputs', () => {
        test('should parse numeric strings to integers', () => {
            expect(cleanParameter('123')).toBe(123);
            expect(cleanParameter('0')).toBe(0);
            expect(cleanParameter('-5')).toBe(-5);
        });

        test('should parse decimal strings as integers', () => {
            // parseInt truncates decimals
            expect(cleanParameter('3.14')).toBe(3);
        });

        test('should handle numeric strings with whitespace', () => {
            expect(cleanParameter(' 42 ')).toBe(42);
        });
    });

    describe('edge cases and invalid inputs', () => {
        test('should handle null and undefined', () => {
            expect(cleanParameter(null)).toBe(NaN);
        });

        test('should handle empty string', () => {
            expect(cleanParameter('')).toBe(NaN);
        });

        test('should handle non-numeric strings', () => {
            expect(cleanParameter('abc')).toBe(NaN);
        });

        test('should handle strings that start with numbers', () => {
            // parseInt parses until it hits non-numeric character
            expect(cleanParameter('123abc')).toBe(123);
        });

        test('should handle special values', () => {
            expect(cleanParameter('Infinity')).toBe(NaN);
        });

        test('should handle objects and arrays', () => {
            expect(cleanParameter({})).toBe(NaN);
            expect(cleanParameter([])).toBe(NaN);
        });
    });

    describe('type consistency', () => {
        test('should return correct types based on input', () => {
            // Numbers should return numbers
            expect(typeof cleanParameter(42)).toBe('number');
            
            // Boolean strings should return booleans
            expect(typeof cleanParameter('true')).toBe('boolean');
            
            // Invalid inputs should return numbers (NaN)
            expect(typeof cleanParameter('abc')).toBe('number');
        });

        test('should handle NaN consistently', () => {
            const result = cleanParameter('invalid');
            expect(Number.isNaN(result)).toBe(true);
            expect(typeof result).toBe('number');
        });
    });

    describe('parameter validation use cases', () => {
        test('should handle window IDs correctly', () => {
            // Typical window ID scenarios
            expect(cleanParameter('1234567890')).toBe(1234567890);
        });

        test('should handle edge cases from Chrome extension context', () => {
            // Chrome might pass these edge cases
            expect(cleanParameter('-1')).toBe(-1); // WINDOW_ID_NONE
        });
    });
});
