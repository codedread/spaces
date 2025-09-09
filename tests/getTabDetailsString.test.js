import { getTabDetailsString } from '../js/spacesRenderer.js';

describe('getTabDetailsString', () => {
    test('should return an empty string if the space is open', () => {
        const space = { windowId: 123, tabs: [{ title: 'Test Tab' }] };
        expect(getTabDetailsString(space)).toBe('');
    });

    test('should return (0 tabs) if the space is not open and has no tabs', () => {
        const space = { windowId: false, tabs: [] };
        expect(getTabDetailsString(space)).toBe('(0 tabs)');
    });

    test('should return (1 tab) if the space is not open and has one tab', () => {
        const space = { windowId: false, tabs: [{ title: 'Test Tab' }] };
        expect(getTabDetailsString(space)).toBe('(1 tab)');
    });

    test('should return (n tabs) if the space is not open and has multiple tabs', () => {
        const space = { windowId: false, tabs: [{ title: 'Test Tab' }, { title: 'Another Tab' }] };
        expect(getTabDetailsString(space)).toBe('(2 tabs)');
    });
});
