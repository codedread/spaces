/**
 * @jest-environment node
 */

import { utils } from '../js/utils.js';

describe('utils.getHashVariable', () => {
    describe('basic functionality', () => {
        test('should return false for invalid inputs', () => {
            expect(utils.getHashVariable('key', null)).toBe(false);
            expect(utils.getHashVariable('key', undefined)).toBe(false);
            expect(utils.getHashVariable('key', '')).toBe(false);
        });

        test('should return false for URL without hash', () => {
            expect(utils.getHashVariable('key', 'https://example.com')).toBe(false);
        });

        test('should return false for URL with empty hash', () => {
            expect(utils.getHashVariable('key', 'https://example.com#')).toBe(false);
        });
    });

    describe('single key-value pairs', () => {
        test('should extract single key-value pair', () => {
            const url = 'https://example.com#key=value';
            expect(utils.getHashVariable('key', url)).toBe('value');
        });

        test('should return false for non-existent key', () => {
            const url = 'https://example.com#key=value';
            expect(utils.getHashVariable('missing', url)).toBe(false);
        });

        test('should handle numeric values', () => {
            const url = 'https://example.com#id=123';
            expect(utils.getHashVariable('id', url)).toBe('123');
        });

        test('should return false for empty values', () => {
            const url = 'https://example.com#key=';
            // The regex /^(.+)=(.+)/ requires at least one character after =
            expect(utils.getHashVariable('key', url)).toBe(false);
        });
    });

    describe('multiple key-value pairs', () => {
        test('should extract keys from any position in multiple pairs', () => {
            const url = 'https://example.com#first=value1&second=value2&third=value3';
            expect(utils.getHashVariable('first', url)).toBe('value1');   // first position
            expect(utils.getHashVariable('second', url)).toBe('value2');  // middle position
            expect(utils.getHashVariable('third', url)).toBe('value3');   // last position
        });

        test('should return false for non-existent key in multiple pairs', () => {
            const url = 'https://example.com#first=value1&second=value2&third=value3';
            expect(utils.getHashVariable('fourth', url)).toBe(false);
        });
    });

    describe('special characters and encoding', () => {
        test('should handle values with special characters', () => {
            const url = 'https://example.com#message=hello%20world';
            expect(utils.getHashVariable('message', url)).toBe('hello%20world');
        });

        test('should handle keys with special characters', () => {
            const url = 'https://example.com#special-key=value';
            expect(utils.getHashVariable('special-key', url)).toBe('value');
        });

        test('should return false for values with equals signs', () => {
            // The regex /^(.+)=(.+)/ doesn't handle multiple = signs properly
            const url = 'https://example.com#equation=x=y';
            expect(utils.getHashVariable('equation', url)).toBe(false);
        });

        test('should handle values with ampersands in query parameters before hash', () => {
            const url = 'https://example.com?param1=val1&param2=val2#key=value';
            expect(utils.getHashVariable('key', url)).toBe('value');
        });
    });

    describe('malformed hash fragments', () => {
        test('should ignore key-value pairs without equals sign', () => {
            const url = 'https://example.com#validkey=validvalue&invalidpair&anotherkey=anothervalue';
            expect(utils.getHashVariable('validkey', url)).toBe('validvalue');
            expect(utils.getHashVariable('anotherkey', url)).toBe('anothervalue');
            expect(utils.getHashVariable('invalidpair', url)).toBe(false);
        });

        test('should ignore empty key-value pairs', () => {
            const url = 'https://example.com#key=value&&anotherkey=anothervalue';
            expect(utils.getHashVariable('key', url)).toBe('value');
            expect(utils.getHashVariable('anotherkey', url)).toBe('anothervalue');
        });

        test('should handle hash with only ampersands', () => {
            const url = 'https://example.com#&&&';
            expect(utils.getHashVariable('key', url)).toBe(false);
        });
    });

    describe('edge cases', () => {
        test('should include everything after first hash including additional hash symbols', () => {
            const url = 'https://example.com#key=value#extra';
            // The regex extracts everything after the first # symbol
            expect(utils.getHashVariable('key', url)).toBe('value#extra');
        });

        test('should be case-sensitive for keys', () => {
            const url = 'https://example.com#Key=value';
            expect(utils.getHashVariable('key', url)).toBe(false);
            expect(utils.getHashVariable('Key', url)).toBe('value');
        });

        test('should handle duplicate keys (last one wins behavior)', () => {
            const url = 'https://example.com#key=first&key=second';
            // Based on the implementation, the last key should overwrite the first
            expect(utils.getHashVariable('key', url)).toBe('second');
        });

        test('should return false for hash at the beginning of string', () => {
            const url = '#key=value';
            // The regex /^[^#]+#+(.*)/ expects at least one non-# character before #
            expect(utils.getHashVariable('key', url)).toBe(false);
        });

        test('should handle very long values', () => {
            const longValue = 'a'.repeat(1000);
            const url = `https://example.com#data=${longValue}`;
            expect(utils.getHashVariable('data', url)).toBe(longValue);
        });
    });

    describe('regex behavior documentation', () => {
        test('should extract hash correctly with complex URLs', () => {
            const complexUrl = 'https://user:pass@example.com:8080/path?query=value&other=test#key=hashvalue&second=pair';
            expect(utils.getHashVariable('key', complexUrl)).toBe('hashvalue');
            expect(utils.getHashVariable('second', complexUrl)).toBe('pair');
        });
    });

    describe('real-world URL scenarios', () => {
        test('should handle Chrome extension URLs', () => {
            const url = 'chrome-extension://abcdef123456/spaces.html#sessionId=123&editMode=true';
            expect(utils.getHashVariable('sessionId', url)).toBe('123');
            expect(utils.getHashVariable('editMode', url)).toBe('true');
        });

        test('should handle file URLs', () => {
            const url = 'file:///path/to/file.html#section=intro&version=1.0';
            expect(utils.getHashVariable('section', url)).toBe('intro');
            expect(utils.getHashVariable('version', url)).toBe('1.0');
        });

        test('should handle URLs with ports', () => {
            const url = 'http://localhost:3000/app#tab=settings&debug=true';
            expect(utils.getHashVariable('tab', url)).toBe('settings');
            expect(utils.getHashVariable('debug', url)).toBe('true');
        });
    });
});
