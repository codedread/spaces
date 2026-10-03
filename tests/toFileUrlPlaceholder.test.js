import { toFileUrlPlaceholder } from '../js/common.js';

const PREFIX = 'data:text/html;charset=utf-8,';

/** Decodes the HTML out of a placeholder data: URL. */
function placeholderHtml(dataUrl) {
    expect(dataUrl.startsWith(PREFIX)).toBe(true);
    return decodeURIComponent(dataUrl.substring(PREFIX.length));
}

describe('toFileUrlPlaceholder', () => {
    test('returns non-file URLs unchanged', () => {
        expect(toFileUrlPlaceholder('https://example.com/a?b=c#d')).toBe('https://example.com/a?b=c#d');
        expect(toFileUrlPlaceholder('chrome://settings')).toBe('chrome://settings');
        expect(toFileUrlPlaceholder(undefined)).toBe(undefined);
    });

    test('turns a file: URL into a data:text/html page that names the URL', () => {
        const html = placeholderHtml(toFileUrlPlaceholder('file:///home/me/doc.pdf'));
        expect(html).toContain('Spaces Cannot Open Local Files');
        expect(html).toContain('<title>doc.pdf</title>');
        expect(html).toMatch(/The Spaces extension cannot open local file <code[^>]*>file:\/\/\/home\/me\/doc\.pdf<\/code>/);
    });

    test('decodes the file name for the title', () => {
        const html = placeholderHtml(toFileUrlPlaceholder('file:///home/me/My%20Report.pdf'));
        expect(html).toContain('<title>My Report.pdf</title>');
    });

    test('falls back to the full URL for the title when there is no file name', () => {
        const html = placeholderHtml(toFileUrlPlaceholder('file:///home/me/'));
        expect(html).toContain('<title>file:///home/me/</title>');
    });

    test('survives a malformed escape sequence in the file name', () => {
        const html = placeholderHtml(toFileUrlPlaceholder('file:///home/me/bad%E0%A4%A.pdf'));
        expect(html).toContain('<title>file:///home/me/bad%E0%A4%A.pdf</title>');
    });

    test('escapes HTML in the URL', () => {
        const html = placeholderHtml(toFileUrlPlaceholder('file:///tmp/<script>alert(1)</script>&"x\'.html'));
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;x&#039;.html');
    });

    test('encodes characters that would break a data: URL', () => {
        const url = toFileUrlPlaceholder('file:///tmp/a b#c?d%.html');
        const body = url.substring(PREFIX.length);
        expect(body).not.toMatch(/[ #?]/);
        expect(placeholderHtml(url)).toContain('file:///tmp/a b#c?d%.html');
    });

    test('is safe to apply twice', () => {
        const once = toFileUrlPlaceholder('file:///home/me/doc.pdf');
        expect(toFileUrlPlaceholder(once)).toBe(once);
    });
});
