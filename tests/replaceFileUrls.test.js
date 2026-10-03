import { replaceFileUrls, toFileUrlPlaceholder } from '../js/common.js';

describe('replaceFileUrls', () => {
    test('replaces only file: URLs', () => {
        const tabs = [
            { url: 'https://example.com', title: 'Example', favIconUrl: 'https://example.com/i.png' },
            { url: 'file:///home/me/doc.pdf', title: 'doc.pdf', favIconUrl: 'x.png', pinned: true, id: 7 },
        ];

        const result = replaceFileUrls(tabs);

        expect(result[0]).toBe(tabs[0]);
        expect(result[1]).toEqual({
            url: toFileUrlPlaceholder('file:///home/me/doc.pdf'),
            title: 'doc.pdf',
            pinned: true,
            id: 7,
        });
    });

    test('does not modify the input', () => {
        const tabs = [{ url: 'file:///a.txt', title: 'a', favIconUrl: 'f' }];
        const copy = structuredClone(tabs);

        replaceFileUrls(tabs);

        expect(tabs).toEqual(copy);
    });

    test('returns the original array when there is nothing to replace', () => {
        const tabs = [{ url: 'https://example.com' }];
        expect(replaceFileUrls(tabs)).toBe(tabs);
    });

    test('passes through missing tab lists', () => {
        expect(replaceFileUrls(false)).toBe(false);
        expect(replaceFileUrls(undefined)).toBe(undefined);
    });

    test('tolerates empty entries', () => {
        const result = replaceFileUrls([null, { url: 'file:///a' }]);
        expect(result[0]).toBeNull();
        expect(result[1].url).toBe(toFileUrlPlaceholder('file:///a'));
    });
});
