import { decode } from '@mapbox/polyline';

import {
  buildTerrainRequest,
  cacheTerrainData,
  calculateNaturalSurfacePercentage,
  fetchTerrainData,
  formatTerrainInfo,
  generateSegmentColor,
  getCachedTerrainData,
} from '../terrainUtils';

jest.mock('@mapbox/polyline', () => ({
  decode: jest.fn(),
}));

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('terrainUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn();
  });

  it('generates consistent uppercase colors for the same segment id', () => {
    expect(generateSegmentColor(123)).toBe(generateSegmentColor(123));
    expect(generateSegmentColor(123)).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('calculates natural surface percentage from route surfaces', () => {
    expect(calculateNaturalSurfacePercentage(['gravel', 'asphalt', 'path'])).toBe(67);
    expect(calculateNaturalSurfacePercentage([])).toBe(0);
  });

  it('formats terrain info for popup content', () => {
    const content = formatTerrainInfo({
      surfaces: ['gravel', 'unknown'],
      tracktypes: ['grade2'],
      highways: ['track'],
      natural_percentage: 72.5,
    });

    expect(content).toContain('Surface: gravel, unknown');
    expect(content).toContain('Track Type: grade2');
    expect(content).toContain('Road Type: track');
    expect(content).toContain('Unpaved Estimate: 72.5% of route');
  });

  it('builds a terrain request from a polyline-backed route', () => {
    decode.mockReturnValue([
      [40.0, -105.0],
      [40.01, -104.99],
    ]);

    expect(buildTerrainRequest({ polyline: 'encoded' })).toEqual({
      start_lat: 40.0,
      start_lon: -105.0,
      end_lat: 40.01,
      end_lon: -104.99,
      polyline: 'encoded',
      distance_threshold: 25,
    });
  });

  it('caches terrain data with the v2 cache key', () => {
    cacheTerrainData('activity_123', { surfaces: ['gravel'] });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'terrain_activity_123_v2',
      expect.stringContaining('"surfaces":["gravel"]'),
    );
  });

  it('retrieves terrain data from cache when it is fresh', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify({
      data: { surfaces: ['gravel'] },
      timestamp: Date.now(),
    }));

    expect(getCachedTerrainData('activity_123')).toEqual({ surfaces: ['gravel'] });
  });

  it('fetches terrain data from the backend', async () => {
    decode.mockReturnValue([
      [40.0, -105.0],
      [40.01, -104.99],
    ]);
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ natural_percentage: 80 }),
    });

    const result = await fetchTerrainData({ polyline: 'encoded' });

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/api/terrain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_lat: 40.0,
        start_lon: -105.0,
        end_lat: 40.01,
        end_lon: -104.99,
        polyline: 'encoded',
        distance_threshold: 25,
      }),
    });
    expect(result).toEqual({ natural_percentage: 80 });
  });
});
