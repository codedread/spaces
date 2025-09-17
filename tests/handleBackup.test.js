import { normaliseTabUrl, getSpacesForBackup } from '../js/spaces.js';
import { jest, setupChromeMocks } from './helpers.js';

// Set up Chrome mocks
setupChromeMocks();

describe('handleBackup functionality', () => {

  describe('normaliseTabUrl', () => {
    it('should extract original URL from Great Suspender suspended tab URL', () => {
      const suspendedUrl = 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html?uri=https://github.com/user/repo';
      const result = normaliseTabUrl(suspendedUrl);
      expect(result).toBe('https://github.com/user/repo');
    });

    it('should return unchanged URL for non-suspended tabs', () => {
      const normalUrl = 'https://example.com';
      const result = normaliseTabUrl(normalUrl);
      expect(result).toBe('https://example.com');
    });

    it('should handle URLs with multiple query parameters', () => {
      const suspendedUrl = 'chrome-extension://abc/suspended.html?param1=value1&uri=https://test.com&param2=value2';
      const result = normaliseTabUrl(suspendedUrl);
      expect(result).toBe('https://test.com&param2=value2');
    });

    it('should handle malformed suspended URLs gracefully', () => {
      const malformedUrl = 'chrome-extension://abc/suspended.html?noUri=test';
      const result = normaliseTabUrl(malformedUrl);
      expect(result).toBe(malformedUrl); // Should return unchanged
    });

    it('should handle hash-based URIs correctly', () => {
      const suspendedUrl = 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=https://example.com';
      const result = normaliseTabUrl(suspendedUrl);
      expect(result).toBe('https://example.com');
    });

    it('should handle complex URLs with query parameters and hash fragments', () => {
      const complexUrl = 'chrome-extension://different-id/suspended.html?title=Test&uri=https://docs.example.com/api/v1/users?sort=name&page=5#results';
      const result = normaliseTabUrl(complexUrl);
      expect(result).toBe('https://docs.example.com/api/v1/users?sort=name&page=5#results');
    });

    it('should return unchanged URLs that do not match suspended pattern', () => {
      expect(normaliseTabUrl('https://example.com#section')).toBe('https://example.com#section');
      expect(normaliseTabUrl('chrome://settings/')).toBe('chrome://settings/');
    });

    it('should require both suspended.html and uri parameter', () => {
      expect(normaliseTabUrl('chrome-extension://abc/suspended.html#title=Something')).toBe('chrome-extension://abc/suspended.html#title=Something');
      expect(normaliseTabUrl('https://example.com/page.html#uri=https://other.com')).toBe('https://example.com/page.html#uri=https://other.com');
    });

    it('should require suspended.html not at beginning (indexOf > 0)', () => {
      expect(normaliseTabUrl('suspended.html#uri=https://example.com')).toBe('suspended.html#uri=https://example.com');
    });

    it('should extract from first uri parameter when multiple exist', () => {
      const url = 'chrome-extension://abc/suspended.html#uri=https://first.com&other=param&uri=https://second.com';
      const result = normaliseTabUrl(url);
      expect(result).toBe('https://first.com&other=param&uri=https://second.com');
    });

    it('should handle edge case inputs', () => {
      expect(normaliseTabUrl('')).toBe('');
      expect(() => normaliseTabUrl(null)).toThrow();
      expect(() => normaliseTabUrl(123)).toThrow();
      expect(normaliseTabUrl([])).toEqual([]); // Arrays have indexOf
    });
  });

  describe('getSpacesForBackup', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch all spaces and transform to lean format', async () => {
      const mockSpaces = [
        {
          name: 'Work Space',
          id: 'should-be-removed',
          sessionId: 'should-be-removed',
          windowId: 'should-be-removed',
          tabs: [
            {
              title: 'Gmail',
              url: 'https://gmail.com',
              favIconUrl: 'gmail.ico',
              id: 'tab-1',
              active: true,
              pinned: false,
              index: 0,
            },
            {
              title: 'GitHub',
              url: 'chrome-extension://abc/suspended.html?uri=https://github.com',
              favIconUrl: 'github.ico',
              id: 'tab-2',
              active: false,
            },
          ],
        },
        {
          name: 'Personal Space',
          extraProperty: 'should-be-removed',
          tabs: [
            {
              title: 'YouTube',
              url: 'https://youtube.com',
              favIconUrl: 'yt.ico',
              someOtherProp: 'remove-me',
            },
          ],
        },
      ];

      global.chrome.runtime.sendMessage.mockResolvedValue(mockSpaces);

      const result = await getSpacesForBackup();

      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'requestAllSpaces',
      });

      expect(result).toEqual([
        {
          name: 'Work Space',
          tabs: [
            {
              title: 'Gmail',
              url: 'https://gmail.com',
              favIconUrl: 'gmail.ico',
            },
            {
              title: 'GitHub',
              url: 'https://github.com', // URL should be normalized
              favIconUrl: 'github.ico',
            },
          ],
        },
        {
          name: 'Personal Space',
          tabs: [
            {
              title: 'YouTube',
              url: 'https://youtube.com',
              favIconUrl: 'yt.ico',
            },
          ],
        },
      ]);

      // Verify unwanted properties are not included
      expect(result[0]).not.toHaveProperty('id');
      expect(result[0]).not.toHaveProperty('sessionId');
      expect(result[0]).not.toHaveProperty('windowId');
      expect(result[0].tabs[0]).not.toHaveProperty('active');
      expect(result[0].tabs[0]).not.toHaveProperty('pinned');
      expect(result[0].tabs[0]).not.toHaveProperty('index');
      expect(result[1]).not.toHaveProperty('extraProperty');
      expect(result[1].tabs[0]).not.toHaveProperty('someOtherProp');

      // Verify the result can be serialized to valid JSON
      const jsonString = JSON.stringify(result);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsedContent = JSON.parse(jsonString);
      expect(Array.isArray(parsedContent)).toBe(true);
      expect(parsedContent).toHaveLength(2);
    });

    it('should handle empty spaces array', async () => {
      global.chrome.runtime.sendMessage.mockResolvedValue([]);

      const result = await getSpacesForBackup();

      expect(result).toEqual([]);
    });

    it('should handle spaces with missing properties', async () => {
      const mockSpaces = [
        {
          // missing name
          tabs: [
            {
              title: 'Tab 1',
              url: 'https://example.com',
              // missing favIconUrl
            },
            {
              title: 'Tab 2',
              url: 'https://example2.com',
              favIconUrl: null,
            },
          ],
        },
        {
          name: 'Named Space',
          tabs: [], // empty tabs
        },
      ];

      global.chrome.runtime.sendMessage.mockResolvedValue(mockSpaces);

      const result = await getSpacesForBackup();

      expect(result).toEqual([
        {
          name: undefined,
          tabs: [
            {
              title: 'Tab 1',
              url: 'https://example.com',
              favIconUrl: undefined,
            },
            {
              title: 'Tab 2',
              url: 'https://example2.com',
              favIconUrl: null,
            },
          ],
        },
        {
          name: 'Named Space',
          tabs: [],
        },
      ]);
    });

    it('should preserve tab title and handle missing titles', async () => {
      const mockSpaces = [
        {
          name: 'Test Space',
          tabs: [
            {
              title: 'Normal Title',
              url: 'https://example.com',
              favIconUrl: 'icon.ico',
            },
            {
              // missing title
              url: 'https://no-title.com',
              favIconUrl: 'icon2.ico',
            },
            {
              title: null,
              url: 'https://null-title.com',
              favIconUrl: 'icon3.ico',
            },
          ],
        },
      ];

      global.chrome.runtime.sendMessage.mockResolvedValue(mockSpaces);

      const result = await getSpacesForBackup();

      expect(result[0].tabs[0].title).toBe('Normal Title');
      expect(result[0].tabs[1].title).toBeUndefined();
      expect(result[0].tabs[2].title).toBeNull();
    });
  });
});
