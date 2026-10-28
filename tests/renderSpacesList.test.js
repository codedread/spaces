/**
 * Unit tests for renderSpacesList in js/spaces.js
 */
import { jest, setupTestMocks } from './helpers.js';
import { renderSpacesList, setNodesForTesting } from '../js/spaces.js';

setupTestMocks();

/** A minimal stand-in for a DOM element: just enough for renderSpacesList. */
function fakeElement(tagName) {
    return {
        tagName,
        children: [],
        className: '',
        innerHTML: '',
        textContent: '',
        setAttribute: jest.fn(),
        appendChild(child) { this.children.push(child); },
    };
}

describe('renderSpacesList', () => {
    let nodes;

    beforeEach(() => {
        document.createElement = jest.fn(fakeElement);
        nodes = {
            openSpaces: fakeElement('ul'),
            closedSpaces: fakeElement('ul'),
            openSpacesHeading: fakeElement('h2'),
        };
        setNodesForTesting(nodes);
    });

    test('counts tabs and windows of open spaces only', () => {
        renderSpacesList([
            { sessionId: 1, windowId: 10, name: 'Work', tabs: [{}, {}, {}] },
            { sessionId: false, windowId: 11, name: false, tabs: [{}, {}] },
            { sessionId: 2, windowId: false, name: 'Old', tabs: [{}, {}, {}, {}] },
        ]);

        expect(nodes.openSpacesHeading.textContent).toBe('Open Spaces (5 tabs across 2 windows)');
        expect(nodes.openSpaces.children).toHaveLength(2);
        expect(nodes.closedSpaces.children).toHaveLength(1);
    });

    test('updates the counts when re-rendered', () => {
        renderSpacesList([{ sessionId: 1, windowId: 10, name: 'Work', tabs: [{}, {}] }]);
        renderSpacesList([{ sessionId: 1, windowId: 10, name: 'Work', tabs: [{}] }]);

        expect(nodes.openSpacesHeading.textContent).toBe('Open Spaces (1 tab across 1 window)');
    });

    test('shows zero counts when no spaces are open', () => {
        renderSpacesList([{ sessionId: 2, windowId: false, name: 'Old', tabs: [{}] }]);

        expect(nodes.openSpacesHeading.textContent).toBe('Open Spaces (0 tabs across 0 windows)');
    });

    test('treats a missing tabs array as zero tabs', () => {
        renderSpacesList([{ sessionId: 1, windowId: 10, name: 'Work' }]);

        expect(nodes.openSpacesHeading.textContent).toBe('Open Spaces (0 tabs across 1 window)');
    });
});
