import { getDefaultSpaceTitle } from '../js/spacesRenderer.js';

describe('getDefaultSpaceTitle', () => {
    test('should return an empty string if there are no tabs', () => {
        const space = { tabs: [] };
        expect(getDefaultSpaceTitle(space)).toBe('');
    });

    test('should return the title of the single tab', () => {
        const space = { tabs: [{ title: 'Test Tab' }] };
        expect(getDefaultSpaceTitle(space)).toBe('[Test Tab]');
    });

    test('should return the title of the first tab and a count of the others', () => {
        const space = { tabs: [{ title: 'Test Tab' }, { title: 'Another Tab' }] };
        expect(getDefaultSpaceTitle(space)).toBe('[Test Tab] +1 more');
    });

    test('should truncate long titles', () => {
        const space = {
            tabs: [
                { title: 'This is a very long tab title that should be truncated' },
                { title: 'Another Tab' }
            ]
        };
        expect(getDefaultSpaceTitle(space)).toBe('[This is a very long t&hellip;] +1 more');
    });

    test('should escape HTML in the title', () => {
        const space = { tabs: [{ title: '<script>alert("xss")</script>' }] };
        expect(getDefaultSpaceTitle(space)).toBe('[&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;]');
    });
});
