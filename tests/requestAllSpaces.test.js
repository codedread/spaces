import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { requestAllSpaces } from '../js/background/background.js';
import { spacesService } from '../js/background/spacesService.js';

describe('requestAllSpaces', () => {
  let getAllSessionsSpy;

  beforeEach(() => {
    // Spy on the method and provide a mock implementation for each test
    getAllSessionsSpy = jest.spyOn(spacesService, 'getAllSessions');
  });

  afterEach(() => {
    // Restore the original implementation after each test
    getAllSessionsSpy.mockRestore();
  });

  test('should return sorted spaces with open windows first, then by last access time', async () => {
    const mockSessions = [
      { id: 1, name: 'Saved Space 1', windowId: null, tabs: [{ url: 'http://a.com' }], lastAccess: new Date('2023-01-01T12:00:00Z') },
      { id: 2, name: 'Open Window 1', windowId: 101, tabs: [{ url: 'http://b.com' }], lastAccess: new Date('2023-01-02T12:00:00Z') },
      { id: 3, name: 'Saved Space 2', windowId: null, tabs: [{ url: 'http://c.com' }], lastAccess: new Date('2023-01-03T12:00:00Z') },
      { id: 4, name: 'Open Window 2', windowId: 102, tabs: [{ url: 'http://d.com' }], lastAccess: new Date('2023-01-01T10:00:00Z') },
      { id: 5, name: 'Empty Space', windowId: null, tabs: [], lastAccess: new Date('2023-01-05T12:00:00Z') }, // Should be filtered out
    ];

    getAllSessionsSpy.mockResolvedValue(mockSessions);

    const spaces = await requestAllSpaces();

    // Verify that getAllSessions was called
    expect(getAllSessionsSpy).toHaveBeenCalledTimes(1);

    // Check the length of the returned spaces (should exclude the empty one)
    expect(spaces.length).toBe(4);

    // Check the sorting order
    // 1. Open Window 1 (id: 2) - open
    // 2. Open Window 2 (id: 4) - open
    // 3. Saved Space 2 (id: 3) - most recent lastAccess
    // 4. Saved Space 1 (id: 1) - older lastAccess
    expect(spaces[0].id).toBe(2); // Open Window 1
    expect(spaces[1].id).toBe(4); // Open Window 2
    expect(spaces[2].id).toBe(3); // Saved Space 2
    expect(spaces[3].id).toBe(1); // Saved Space 1

    // Check that the mapping from session to space is correct
    expect(spaces[0]).toEqual(expect.objectContaining({ sessionId: 2, name: 'Open Window 1' }));
  });

  test('should return an empty array when no sessions are available', async () => {
    getAllSessionsSpy.mockResolvedValue([]);

    const spaces = await requestAllSpaces();

    expect(getAllSessionsSpy).toHaveBeenCalledTimes(1);
    expect(spaces).toEqual([]);
  });

  test('should filter out sessions that have no tabs', async () => {
    const mockSessions = [
      { id: 1, name: 'Valid Space', windowId: null, tabs: [{ url: 'http://a.com' }], lastAccess: new Date() },
      { id: 2, name: 'Empty Space', windowId: 101, tabs: [], lastAccess: new Date() },
      { id: 3, name: 'Null Tabs Space', windowId: null, tabs: null, lastAccess: new Date() },
    ];

    getAllSessionsSpy.mockResolvedValue(mockSessions);

    const spaces = await requestAllSpaces();

    expect(spaces.length).toBe(1);
    expect(spaces[0].id).toBe(1);
  });

  test('should handle sessions with only open windows', async () => {
    const mockSessions = [
        { id: 1, name: 'Open Window 1', windowId: 101, tabs: [{ url: 'http://a.com' }], lastAccess: new Date('2023-01-01T12:00:00Z') },
        { id: 2, name: 'Open Window 2', windowId: 102, tabs: [{ url: 'http://b.com' }], lastAccess: new Date('2023-01-02T12:00:00Z') },
    ];
    
    getAllSessionsSpy.mockResolvedValue(mockSessions);

    const spaces = await requestAllSpaces();

    expect(spaces.length).toBe(2);
    // The order between two open windows doesn't have a secondary sort key in the original function,
    // so we just check that both are present.
    expect(spaces.map(s => s.id)).toContain(1);
    expect(spaces.map(s => s.id)).toContain(2);
  });

  test('should correctly sort saved spaces by lastAccess date', async () => {
    const mockSessions = [
      { id: 1, name: 'Oldest', windowId: null, tabs: [{ url: 'http://a.com' }], lastAccess: new Date('2023-01-01T12:00:00Z') },
      { id: 2, name: 'Newest', windowId: null, tabs: [{ url: 'http://b.com' }], lastAccess: new Date('2023-01-03T12:00:00Z') },
      { id: 3, name: 'Middle', windowId: null, tabs: [{ url: 'http://c.com' }], lastAccess: new Date('2023-01-02T12:00:00Z') },
    ];

    getAllSessionsSpy.mockResolvedValue(mockSessions);

    const spaces = await requestAllSpaces();

    expect(spaces.length).toBe(3);
    expect(spaces[0].id).toBe(2); // Newest
    expect(spaces[1].id).toBe(3); // Middle
    expect(spaces[2].id).toBe(1); // Oldest
  });
});
