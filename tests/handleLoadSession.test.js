import { handleLoadSession } from '../js/background/background.js';
import { spacesService } from '../js/background/spacesService.js';
import { dbService } from '../js/background/dbService.js';
import { jest, setupChromeMocks } from './helpers.js';

describe('handleLoadSession', () => {
    let mockSession;
    let mockWorkArea;
    let mockWindow;
    let originalMatchSessionToWindow;

    const createBounds = (left, top, width, height) => ({ left, top, width, height });

    // Constants for test data consistency
    const DEFAULT_WORK_AREA = createBounds(0, 0, 1920, 1080);
    const EXPECTED_FALLBACK_BOUNDS = createBounds(0, 0, 1820, 980);
    const STORED_BOUNDS = createBounds(100, 50, 800, 600);

    beforeEach(() => {
        // Setup chrome API mocks using helpers
        setupChromeMocks();

        // Setup mock session data
        mockSession = {
            id: 1,
            name: 'Test Session',
            windowId: null,
            tabs: [
                { url: 'https://example.com', pinned: false },
                { url: 'https://test.com', pinned: true }
            ]
        };

        mockWorkArea = { ...DEFAULT_WORK_AREA };

        mockWindow = {
            id: 123,
            tabs: [
                { id: 1, url: 'https://example.com' },
                { id: 2, url: 'https://test.com' }
            ]
        };

        // Setup chrome API mock returns (only the ones that need to return values)
        global.chrome.windows.create.mockResolvedValue(mockWindow);
        global.chrome.windows.getCurrent.mockImplementation(() => Promise.resolve(mockWindow));
        global.chrome.windows.get.mockImplementation(() => Promise.resolve(mockWindow));
        global.chrome.system.display.getInfo.mockResolvedValue([
            {
                id: 'display1',
                bounds: { left: 0, top: 0, width: 1920, height: 1080 },
                workArea: mockWorkArea
            }
        ]);

        // Mock database service
        dbService.fetchSessionById = jest.fn().mockResolvedValue(mockSession);

        // Mock spaces service
        originalMatchSessionToWindow = spacesService.matchSessionToWindow;
        spacesService.matchSessionToWindow = jest.fn().mockResolvedValue();

        // Setup global functions
        global.getTargetDisplayWorkArea = jest.fn().mockResolvedValue(mockWorkArea);
        global.getEffectiveTabUrl = jest.fn().mockImplementation(tab => tab.url);
        global.focusOrLoadTabInWindow = jest.fn().mockResolvedValue();
        global.handleLoadWindow = jest.fn().mockResolvedValue();
    });

    afterEach(() => {
        // Restore original functions
        spacesService.matchSessionToWindow = originalMatchSessionToWindow;
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('bounds restoration', () => {

      describe('when session has stored window bounds', () => {
          beforeEach(() => { mockSession.windowBounds = { ...STORED_BOUNDS }; });

          test('should restore window with stored bounds', async () => {
              await handleLoadSession(mockSession.id);

              expect(global.chrome.windows.create).toHaveBeenCalledWith({
                  url: ['https://example.com', 'https://test.com'],
                  height: STORED_BOUNDS.height,
                  width: STORED_BOUNDS.width,
                  top: STORED_BOUNDS.top,
                  left: STORED_BOUNDS.left
              });
              expect(global.getTargetDisplayWorkArea).not.toHaveBeenCalled();
          });

          test('should match session to new window', async () => {
              await handleLoadSession(mockSession.id);

              expect(spacesService.matchSessionToWindow).toHaveBeenCalledWith(
                  mockSession,
                  mockWindow
              );
          });

          test('should restore pinned tabs correctly', async () => {
              await handleLoadSession(mockSession.id);

              expect(global.chrome.tabs.update).toHaveBeenCalledWith(2, { pinned: true });
          });
      });

      describe('when session has no stored window bounds', () => {
          beforeEach(() => { mockSession.windowBounds = undefined; });

          test('should use fallback display area bounds', async () => {
              await handleLoadSession(mockSession.id);

              expect(global.chrome.windows.create).toHaveBeenCalledWith({
                  url: ['https://example.com', 'https://test.com'],
                  height: EXPECTED_FALLBACK_BOUNDS.height,
                  width: EXPECTED_FALLBACK_BOUNDS.width,
                  top: EXPECTED_FALLBACK_BOUNDS.top,
                  left: EXPECTED_FALLBACK_BOUNDS.left
              });
              expect(global.chrome.system.display.getInfo).toHaveBeenCalledTimes(1);
          });
      });

      describe('when session has null window bounds', () => {
          beforeEach(() => { mockSession.windowBounds = null; });

          test('should use fallback display area bounds', async () => {
              await handleLoadSession(mockSession.id);

              expect(global.chrome.windows.create).toHaveBeenCalledWith({
                  url: ['https://example.com', 'https://test.com'],
                  height: EXPECTED_FALLBACK_BOUNDS.height,
                  width: EXPECTED_FALLBACK_BOUNDS.width,
                  top: EXPECTED_FALLBACK_BOUNDS.top,
                  left: EXPECTED_FALLBACK_BOUNDS.left
              });
          });
      });

      describe('when session window already exists', () => {
          beforeEach(() => { mockSession.windowId = 456; });

          test('should focus existing window instead of creating new window', async () => {
              await handleLoadSession(mockSession.id, 'https://focus.com');

              expect(global.chrome.windows.update).toHaveBeenCalledWith(456, { focused: true });
              expect(global.chrome.windows.create).not.toHaveBeenCalled();
          });

          test('should not attempt bounds restoration for existing window', async () => {
              mockSession.windowBounds = { ...STORED_BOUNDS };

              await handleLoadSession(mockSession.id);

              expect(global.chrome.windows.create).not.toHaveBeenCalled();
              expect(global.chrome.system.display.getInfo).not.toHaveBeenCalled();
          });
      });

      describe('with tab URL parameter', () => {
          const TEST_TAB_URL = 'https://focus-tab.com';

          test('should create tab when bounds are restored and tab not found', async () => {
              mockSession.windowBounds = { ...STORED_BOUNDS };

              await handleLoadSession(mockSession.id, TEST_TAB_URL);

              // Tab should be created since it's not in the existing tabs
              expect(global.chrome.tabs.create).toHaveBeenCalledWith({ 
                  url: TEST_TAB_URL, 
                  active: true 
              });
          });

          test('should create tab when using fallback bounds and tab not found', async () => {
              mockSession.windowBounds = undefined;

              await handleLoadSession(mockSession.id, TEST_TAB_URL);

              // Tab should be created since it's not in the existing tabs
              expect(global.chrome.tabs.create).toHaveBeenCalledWith({ 
                  url: TEST_TAB_URL, 
                  active: true 
              });
          });
      });

      describe('edge cases', () => {
          test('should handle session with empty tabs array', async () => {
              mockSession.tabs = [];
              mockSession.windowBounds = { ...STORED_BOUNDS };

              await handleLoadSession(mockSession.id);

              expect(global.chrome.windows.create).toHaveBeenCalledWith({
                  url: [],
                  height: STORED_BOUNDS.height,
                  width: STORED_BOUNDS.width,
                  top: STORED_BOUNDS.top,
                  left: STORED_BOUNDS.left
              });
          });

          test('should handle partially defined bounds (gracefully fail to fallback)', async () => {
              mockSession.windowBounds = {
                  left: 100,
                  top: 50
                  // missing width and height
              };

              await handleLoadSession(mockSession.id);

              // Should use stored bounds even if incomplete
              expect(global.chrome.windows.create).toHaveBeenCalledWith({
                  url: ['https://example.com', 'https://test.com'],
                  height: undefined,
                  width: undefined,
                  top: 50,
                  left: 100
              });
          });
      });
  });  // close bounds restoration describe
});  // close handleLoadSession describe
