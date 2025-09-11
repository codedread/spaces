import { getEffectiveTabUrl } from '../js/background/background.js';

describe('getEffectiveTabUrl', () => {
  test('should return tab URL when status is complete', () => {
    const tab = {
      id: 1,
      url: 'https://example.com?param=value',
      status: 'complete'
    };

    const result = getEffectiveTabUrl(tab);

    // Should return URL as-is (no cleaning)
    expect(result).toBe('https://example.com?param=value');
  });

  test('should return pendingUrl when status is loading and pendingUrl exists', () => {
    const tab = {
      id: 1,
      url: 'about:blank',
      pendingUrl: 'https://example.com/path#section',
      status: 'loading'
    };

    const result = getEffectiveTabUrl(tab);

    // Should use pendingUrl as-is (no cleaning)
    expect(result).toBe('https://example.com/path#section');
  });

  test('should return tab URL when status is loading but no pendingUrl', () => {
    const tab = {
      id: 1,
      url: 'https://example.com?foo=bar',
      status: 'loading'
    };

    const result = getEffectiveTabUrl(tab);

    expect(result).toBe('https://example.com?foo=bar');
  });

  test('should return tab URL when pendingUrl exists but status is not loading', () => {
    const tab = {
      id: 1,
      url: 'https://example.com?foo=bar',
      pendingUrl: 'https://different.com',
      status: 'complete'
    };

    const result = getEffectiveTabUrl(tab);

    expect(result).toBe('https://example.com?foo=bar');
  });

  test('should handle tab with no status property', () => {
    const tab = {
      id: 1,
      url: 'https://example.com#hash'
    };

    const result = getEffectiveTabUrl(tab);

    expect(result).toBe('https://example.com#hash');
  });

  test('should handle tab with empty pendingUrl', () => {
    const tab = {
      id: 1,
      url: 'https://example.com?query=test',
      pendingUrl: '',
      status: 'loading'
    };

    const result = getEffectiveTabUrl(tab);

    expect(result).toBe('https://example.com?query=test');
  });
});
