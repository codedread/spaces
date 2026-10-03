
import { setupChromeMocks, jest } from './helpers.js';

jest.mock('../js/background/spacesService.js', () => ({
  cleanUrl: jest.fn(url => url),
}));

describe('focusOrLoadTabInWindow', () => {
  let focusOrLoadTabInWindow;

  beforeEach(async () => {
    setupChromeMocks();
    const background = await import('../js/background/background.js');
    focusOrLoadTabInWindow = background.focusOrLoadTabInWindow;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should focus existing tab when match is found', async () => {
    const window = {
      tabs: [
        { id: 1, url: 'https://example.com', status: 'complete' },
        { id: 2, url: 'https://google.com', status: 'complete' },
      ],
    };
    const tabUrl = 'https://example.com';

    await focusOrLoadTabInWindow(window, tabUrl);

    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('should create new tab when no match is found', async () => {
    const window = {
      tabs: [
        { id: 1, url: 'https://google.com', status: 'complete' },
        { id: 2, url: 'https://github.com', status: 'complete' },
      ],
    };
    const tabUrl = 'https://example.com';

    await focusOrLoadTabInWindow(window, tabUrl);

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: tabUrl, active: true });
  });

  test('should handle window with no tabs gracefully', async () => {
    const window = { tabs: [] };
    const tabUrl = 'https://example.com';

    await focusOrLoadTabInWindow(window, tabUrl);

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: tabUrl, active: true });
  });

  test('should handle window with missing tabs property', async () => {
    const window = {};
    const tabUrl = 'https://example.com';

    await focusOrLoadTabInWindow(window, tabUrl);

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: tabUrl, active: true });
  });

  test('should focus a live file: tab that is already open', async () => {
    const window = { tabs: [{ id: 3, url: 'file:///home/me/doc.pdf', status: 'complete' }] };

    await focusOrLoadTabInWindow(window, 'file:///home/me/doc.pdf');

    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('should open a placeholder page instead of a missing file: tab', async () => {
    const { toFileUrlPlaceholder } = await import('../js/common.js');
    const tabUrl = 'file:///home/me/doc.pdf';

    await focusOrLoadTabInWindow({ tabs: [] }, tabUrl);

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: toFileUrlPlaceholder(tabUrl), active: true });
  });
});
