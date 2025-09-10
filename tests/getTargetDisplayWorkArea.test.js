import { getTargetDisplayWorkArea } from '../js/background/background.js';
import { setupChromeMocks, jest } from './helpers.js';

setupChromeMocks();

// Mock data for displays
const mockDisplays = [
    {
        id: 'primary-display',
        isPrimary: true,
        workArea: { top: 24, left: 0, width: 1920, height: 1056 },
        bounds: { top: 0, left: 0, width: 1920, height: 1080 },
    },
    {
        id: 'secondary-display',
        isPrimary: false,
        workArea: { top: 0, left: 1920, width: 1280, height: 800 },
        bounds: { top: 0, left: 1920, width: 1280, height: 800 },
    },
];

// Mock data for windows positioned on different displays
const mockWindowOnPrimary = {
    id: 101,
    left: 100,
    top: 100,
    width: 800,
    height: 600,
}; // Center: (500, 400) -> on primary

const mockWindowOnSecondary = {
    id: 102,
    left: 2000,
    top: 100,
    width: 800,
    height: 600,
}; // Center: (2400, 400) -> on secondary

describe('getTargetDisplayWorkArea', () => {
    beforeEach(() => {
        // Clear all mocks before each test to ensure isolation
        jest.clearAllMocks();
    });

    test('should return primary display work area when no window is focused', async () => {
        chrome.system.display.getInfo.mockResolvedValue(mockDisplays);
        chrome.windows.getCurrent.mockRejectedValue(new Error('No focused window'));

        const workArea = await getTargetDisplayWorkArea();

        expect(workArea).toEqual(mockDisplays[0].workArea);
        expect(chrome.system.display.getInfo).toHaveBeenCalledTimes(1);
        expect(chrome.windows.getCurrent).toHaveBeenCalledTimes(1);
    });

    test('should return primary display work area when focused window is on primary display', async () => {
        chrome.system.display.getInfo.mockResolvedValue(mockDisplays);
        chrome.windows.getCurrent.mockResolvedValue(mockWindowOnPrimary);

        const workArea = await getTargetDisplayWorkArea();

        expect(workArea).toEqual(mockDisplays[0].workArea);
    });

    test('should return secondary display work area when focused window is on secondary display', async () => {
        chrome.system.display.getInfo.mockResolvedValue(mockDisplays);
        chrome.windows.getCurrent.mockResolvedValue(mockWindowOnSecondary);

        const workArea = await getTargetDisplayWorkArea();

        expect(workArea).toEqual(mockDisplays[1].workArea);
    });

    test('should return the only display work area in a single-monitor setup', async () => {
        const singleDisplay = [mockDisplays[0]];
        chrome.system.display.getInfo.mockResolvedValue(singleDisplay);
        chrome.windows.getCurrent.mockResolvedValue(mockWindowOnPrimary);

        const workArea = await getTargetDisplayWorkArea();

        expect(workArea).toEqual(singleDisplay[0].workArea);
    });

    test('should fall back to primary display if focused window is not on any known display', async () => {
        const windowOffScreen = {
            id: 103,
            left: -5000,
            top: -5000,
            width: 800,
            height: 600,
        };
        chrome.system.display.getInfo.mockResolvedValue(mockDisplays);
        chrome.windows.getCurrent.mockResolvedValue(windowOffScreen);

        const workArea = await getTargetDisplayWorkArea();

        expect(workArea).toEqual(mockDisplays[0].workArea);
    });
});
