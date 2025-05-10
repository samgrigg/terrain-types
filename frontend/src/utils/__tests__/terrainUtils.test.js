import {
    generateSegmentColor,
    calculateNaturalSurfacePercentage,
    formatTerrainInfo,
    getCachedTerrainData,
    cacheTerrainData
} from '../terrainUtils';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: jest.fn(key => store[key]),
        setItem: jest.fn((key, value) => {
            store[key] = value;
        }),
        clear: jest.fn(() => {
            store = {};
        })
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('terrainUtils', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('generateSegmentColor', () => {
        it('should generate consistent colors for the same segment ID', () => {
            const color1 = generateSegmentColor(123);
            const color2 = generateSegmentColor(123);
            expect(color1).toBe(color2);
        });

        it('should generate different colors for different segment IDs', () => {
            const color1 = generateSegmentColor(123);
            const color2 = generateSegmentColor(456);
            expect(color1).not.toBe(color2);
        });

        it('should generate valid hex colors', () => {
            const color = generateSegmentColor(123);
            expect(color).toMatch(/^#[0-9A-F]{6}$/);
        });
    });

    describe('calculateNaturalSurfacePercentage', () => {
        it('should return 0 for empty or null surfaces', () => {
            expect(calculateNaturalSurfacePercentage(null)).toBe(0);
            expect(calculateNaturalSurfacePercentage([])).toBe(0);
        });

        it('should calculate correct percentage for natural surfaces', () => {
            const surfaces = ['gravel', 'asphalt', 'dirt', 'concrete'];
            expect(calculateNaturalSurfacePercentage(surfaces)).toBe(50);
        });

        it('should handle case-insensitive surface names', () => {
            const surfaces = ['GRAVEL', 'Asphalt', 'DIRT', 'Concrete'];
            expect(calculateNaturalSurfacePercentage(surfaces)).toBe(50);
        });

        it('should handle partial matches', () => {
            const surfaces = ['unpaved_road', 'asphalt', 'dirt_track'];
            expect(calculateNaturalSurfacePercentage(surfaces)).toBe(66);
        });
    });

    describe('formatTerrainInfo', () => {
        it('should return default message for null data', () => {
            expect(formatTerrainInfo(null)).toBe('No terrain data available');
        });

        it('should format complete terrain data', () => {
            const terrainData = {
                surfaces: ['gravel', 'dirt'],
                tracktypes: ['path', 'track'],
                highways: ['residential'],
                natural_percentage: 75
            };
            const result = formatTerrainInfo(terrainData);
            expect(result).toContain('Surface: gravel, dirt');
            expect(result).toContain('Track Type: path, track');
            expect(result).toContain('Road Type: residential');
            expect(result).toContain('Natural Surface: 75% of distance');
        });

        it('should handle partial terrain data', () => {
            const terrainData = {
                surfaces: ['gravel'],
                natural_percentage: 100
            };
            const result = formatTerrainInfo(terrainData);
            expect(result).toContain('Surface: gravel');
            expect(result).toContain('Natural Surface: 100% of distance');
            expect(result).not.toContain('Track Type');
            expect(result).not.toContain('Road Type');
        });
    });

    describe('terrain data caching', () => {
        it('should cache terrain data', () => {
            const segmentId = '123';
            const data = { surfaces: ['gravel'] };
            cacheTerrainData(segmentId, data);
            expect(localStorage.setItem).toHaveBeenCalledWith(
                'terrain_123_v1',
                expect.stringContaining(JSON.stringify(data))
            );
        });

        it('should retrieve cached terrain data', () => {
            const segmentId = '123';
            const data = { surfaces: ['gravel'] };
            const timestamp = Date.now();
            const cacheData = JSON.stringify({ data, timestamp });
            localStorage.getItem.mockReturnValue(cacheData);

            const result = getCachedTerrainData(segmentId);
            expect(result).toEqual(data);
        });

        it('should return null for expired cache', () => {
            const segmentId = '123';
            const data = { surfaces: ['gravel'] };
            const timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours old
            const cacheData = JSON.stringify({ data, timestamp });
            localStorage.getItem.mockReturnValue(cacheData);

            const result = getCachedTerrainData(segmentId);
            expect(result).toBeNull();
        });

        it('should return null for missing cache', () => {
            localStorage.getItem.mockReturnValue(null);
            const result = getCachedTerrainData('123');
            expect(result).toBeNull();
        });
    });
}); 