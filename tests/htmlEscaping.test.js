import { escapeHtml } from '../js/utils.js';

describe('HTML escaping bug fix', () => {
    test('escapes HTML characters to prevent injection', () => {
        // Core HTML characters
        expect(escapeHtml('<input> element')).toBe('&lt;input&gt; element');
        expect(escapeHtml('AT&T')).toBe('AT&amp;T');
        expect(escapeHtml('"quoted text"')).toBe('&quot;quoted text&quot;');
        expect(escapeHtml("'apostrophe'")).toBe('&#039;apostrophe&#039;');
        
        // Complex injection attempt
        expect(escapeHtml('<script>alert("XSS")</script>'))
            .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    test('handles edge cases correctly', () => {
        // Empty/null values
        expect(escapeHtml('')).toBe('');
        expect(escapeHtml(null)).toBe(null);
        expect(escapeHtml(undefined)).toBe(undefined);
        
        // Normal text unchanged
        expect(escapeHtml('normal text')).toBe('normal text');
    });
});
