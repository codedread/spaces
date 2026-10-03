/**
 * Unit tests for renderTabListEl in js/spaces.js
 */
import { jest, setupTestMocks } from './helpers.js';
import { renderTabListEl } from '../js/spaces.js';

setupTestMocks();

/** A minimal stand-in for a DOM element: just enough for renderTabListEl. */
function fakeElement(tagName) {
    return {
        tagName,
        children: [],
        attributes: {},
        className: '',
        title: '',
        innerHTML: '',
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(child) { this.children.push(child); },
        addEventListener: jest.fn(),
    };
}

function linkOf(listEl) {
    return listEl.children.find(el => el.tagName === 'a');
}

describe('renderTabListEl', () => {
    const space = { sessionId: 1, windowId: false };

    beforeEach(() => {
        document.createElement = jest.fn(fakeElement);
    });

    test('marks duplicate tabs', () => {
        const link = linkOf(renderTabListEl({ url: 'https://a.com', title: 'A', duplicate: true }, space));
        expect(link.className).toBe('duplicate');
    });

    test('leaves ordinary tabs unmarked', () => {
        const link = linkOf(renderTabListEl({ url: 'https://a.com', title: 'A' }, space));
        expect(link.className).toBe('');
        expect(link.title).toBe('');
    });

    test('highlights file: URLs and explains why', () => {
        const link = linkOf(renderTabListEl({ url: 'file:///home/me/doc.pdf', title: 'doc.pdf' }, space));
        expect(link.className).toBe('fileUrl');
        expect(link.title).toMatch(/can't reopen local files/);
    });

    test('the file: highlight wins over the duplicate style', () => {
        const link = linkOf(renderTabListEl({ url: 'FILE:///doc.pdf', title: 'doc.pdf', duplicate: true }, space));
        expect(link.className).toBe('fileUrl');
    });
});
