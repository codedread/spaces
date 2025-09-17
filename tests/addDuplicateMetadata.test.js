import { addDuplicateMetadata } from '../js/spaces.js';

describe('addDuplicateMetadata', () => {
  it('should mark duplicate tabs based on title', () => {
    const space = {
      tabs: [
        { title: 'Gmail', url: 'https://gmail.com' },
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'Gmail', url: 'https://mail.google.com' },
        { title: 'Unique Tab', url: 'https://unique.com' },
      ],
    };

    addDuplicateMetadata(space);

    expect(space.tabs[0].duplicate).toBe(true); // Gmail (duplicate)
    expect(space.tabs[1].duplicate).toBe(false); // GitHub (unique)
    expect(space.tabs[2].duplicate).toBe(true); // Gmail (duplicate)
    expect(space.tabs[3].duplicate).toBe(false); // Unique Tab (unique)
  });

  it('should use URL as title when title is missing', () => {
    const space = {
      tabs: [
        { url: 'https://example.com' }, // no title
        { title: '', url: 'https://empty-title.com' }, // empty title
        { title: null, url: 'https://null-title.com' }, // null title
        { title: 'https://example.com', url: 'https://different.com' }, // same as first URL
      ],
    };

    addDuplicateMetadata(space);

    expect(space.tabs[0].title).toBe('https://example.com');
    expect(space.tabs[1].title).toBe('https://empty-title.com');
    expect(space.tabs[2].title).toBe('https://null-title.com');
    expect(space.tabs[3].title).toBe('https://example.com');

    // Check duplicates
    expect(space.tabs[0].duplicate).toBe(true); // https://example.com (duplicate)
    expect(space.tabs[1].duplicate).toBe(false); // https://empty-title.com (unique)
    expect(space.tabs[2].duplicate).toBe(false); // https://null-title.com (unique)
    expect(space.tabs[3].duplicate).toBe(true); // https://example.com (duplicate)
  });

  it('should handle empty tabs array', () => {
    const space = { tabs: [] };
    
    addDuplicateMetadata(space);
    
    expect(space.tabs).toEqual([]);
  });

  it('should handle null or undefined space safely', () => {
    expect(() => addDuplicateMetadata(null)).not.toThrow();
    expect(() => addDuplicateMetadata(undefined)).not.toThrow();
    expect(() => addDuplicateMetadata({})).not.toThrow();
    expect(() => addDuplicateMetadata({ tabs: null })).not.toThrow();
  });

  it('should handle space without tabs array', () => {
    const space = { name: 'Test Space' }; // no tabs property
    
    expect(() => addDuplicateMetadata(space)).not.toThrow();
  });

  it('should mark all tabs as duplicates when all have same title', () => {
    const space = {
      tabs: [
        { title: 'Same Title', url: 'https://url1.com' },
        { title: 'Same Title', url: 'https://url2.com' },
        { title: 'Same Title', url: 'https://url3.com' },
      ],
    };

    addDuplicateMetadata(space);

    expect(space.tabs[0].duplicate).toBe(true);
    expect(space.tabs[1].duplicate).toBe(true);
    expect(space.tabs[2].duplicate).toBe(true);
  });

  it('should handle single tab as non-duplicate', () => {
    const space = {
      tabs: [
        { title: 'Only Tab', url: 'https://only.com' },
      ],
    };

    addDuplicateMetadata(space);

    expect(space.tabs[0].duplicate).toBe(false);
  });
});