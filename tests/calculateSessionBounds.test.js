import { calculateSessionBounds } from '../js/background/background.js';

const DISPLAY = { left: 0, top: 0, width: 1920, height: 1080 };
const OFFSET = 100;
const FALLBACK_BOUNDS = {
    left: 0,
    top: 0,
    width: 1920 - OFFSET,
    height: 1080 - OFFSET
};

describe('calculateSessionBounds', () => {
    it('returns session bounds if fully within display', () => {
        const session = { left: 100, top: 100, width: 800, height: 600 };
        expect(calculateSessionBounds(DISPLAY, session)).toEqual(session);
    });

    it('falls back to display area if session bounds are missing', () => {
        expect(calculateSessionBounds(DISPLAY, undefined)).toEqual(FALLBACK_BOUNDS);
    });

    it('falls back if session bounds are partially outside display', () => {
        const session = { left: 1800, top: 900, width: 300, height: 300 };
        expect(calculateSessionBounds(DISPLAY, session)).toEqual(FALLBACK_BOUNDS);
    });

    it('falls back if session bounds are negative', () => {
        const session = { left: -100, top: -100, width: 400, height: 300 };
        expect(calculateSessionBounds(DISPLAY, session)).toEqual(FALLBACK_BOUNDS);
    });

    it('falls back if session bounds are too large', () => {
        const session = { left: 0, top: 0, width: 3000, height: 2000 };
        expect(calculateSessionBounds(DISPLAY, session)).toEqual(FALLBACK_BOUNDS);
    });

    it('falls back if session bounds properties are not numbers', () => {
        const session = { left: '100', top: null, width: undefined, height: NaN };
        expect(calculateSessionBounds(DISPLAY, session)).toEqual(FALLBACK_BOUNDS);
    });

    it('falls back if session bounds object is missing properties', () => {
        const session = { left: 100, width: 800 };
        expect(calculateSessionBounds(DISPLAY, session)).toEqual(FALLBACK_BOUNDS);
    });

    it('falls back if session bounds is null', () => {
        expect(calculateSessionBounds(DISPLAY, null)).toEqual(FALLBACK_BOUNDS);
    });
});
