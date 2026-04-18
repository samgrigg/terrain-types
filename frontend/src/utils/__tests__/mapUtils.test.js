jest.mock('@mapbox/polyline', () => ({
  decode: jest.fn(),
}));

jest.mock('leaflet', () => {
  const leaflet = {
    map: jest.fn(() => {
      const mapInstance = {
        setView: jest.fn(() => mapInstance),
        eachLayer: jest.fn(),
        removeLayer: jest.fn(),
        fitBounds: jest.fn(),
      };
      return mapInstance;
    }),
    tileLayer: jest.fn(() => ({
      addTo: jest.fn(),
    })),
    polyline: jest.fn(() => {
      const polylineInstance = {
        addTo: jest.fn(() => polylineInstance),
        getBounds: jest.fn(() => ({ north: 1 })),
      };
      return polylineInstance;
    }),
    Polyline: function Polyline() {},
  };

  return {
    __esModule: true,
    default: leaflet,
    ...leaflet,
  };
});

const L = require('leaflet');
const { decode } = require('@mapbox/polyline');
const {
  clearMapLayers,
  createMainRoutePolyline,
  createSegmentPolyline,
  createSegmentPopup,
  fitMapToSegment,
  initializeMap,
  processActivityData,
  sortSegmentsByPosition,
} = require('../mapUtils');

describe('mapUtils', () => {
  let mapRef;
  let map;
  let polyline;

  beforeEach(() => {
    jest.clearAllMocks();
    mapRef = document.createElement('div');
    map = {
      setView: jest.fn(() => map),
      eachLayer: jest.fn(),
      removeLayer: jest.fn(),
      fitBounds: jest.fn(),
    };
    polyline = {
      addTo: jest.fn(() => polyline),
      getBounds: jest.fn(() => ({ north: 1 })),
    };

    L.map.mockReturnValue(map);
    L.tileLayer.mockReturnValue({ addTo: jest.fn() });
    L.polyline.mockReturnValue(polyline);
  });

  it('initializes the map with OSM tiles', () => {
    initializeMap(mapRef);

    expect(L.map).toHaveBeenCalledWith(mapRef);
    expect(L.tileLayer).toHaveBeenCalledWith(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      expect.any(Object),
    );
  });

  it('removes polyline-like layers from the map', () => {
    const layer = { getLatLngs: jest.fn() };
    map.eachLayer.mockImplementation((callback) => callback(layer));

    clearMapLayers(map);

    expect(map.removeLayer).toHaveBeenCalledWith(layer);
  });

  it('creates route and segment polylines with the expected styles', () => {
    createMainRoutePolyline(map, [[0, 0], [1, 1]]);
    createSegmentPolyline(map, [[0, 0], [1, 1]], { segment: { id: 123 } }, true);
    createSegmentPolyline(
      map,
      [[2, 2], [3, 3]],
      { segment: { id: 456 } },
      false,
      '#8B5A2B',
    );

    expect(L.polyline).toHaveBeenNthCalledWith(1, [[0, 0], [1, 1]], {
      color: '#666666',
      weight: 3,
      opacity: 0.5,
    });
    expect(L.polyline).toHaveBeenNthCalledWith(2, [[0, 0], [1, 1]], {
      color: '#ff0000',
      weight: 7,
      opacity: 0.9,
    });
    expect(L.polyline).toHaveBeenNthCalledWith(3, [[2, 2], [3, 3]], {
      color: '#8B5A2B',
      weight: 5,
      opacity: 0.7,
    });
  });

  it('creates a popup string with segment details', () => {
    const popup = createSegmentPopup(
      {
        name: 'Trail Segment',
        segment: { name: 'Segment A', distance: 1000 },
      },
      1,
      5,
      'Surface: gravel',
    );

    expect(popup).toContain('Trail Segment');
    expect(popup).toContain('Segment A');
    expect(popup).toContain('Position: 2 of 5');
    expect(popup).toContain('Surface: gravel');
  });

  it('fits the map to segment bounds only when there are enough points', () => {
    fitMapToSegment(map, [[0, 0], [1, 1]]);
    fitMapToSegment(map, [[0, 0]]);

    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('processes activity polyline data and handles decode failures', () => {
    decode.mockReturnValue([[0, 0], [1, 1]]);
    expect(processActivityData({ map: { polyline: 'encoded' } })).toEqual([[0, 0], [1, 1]]);

    decode.mockImplementation(() => {
      throw new Error('bad polyline');
    });
    expect(processActivityData({ map: { polyline: 'broken' } })).toBeNull();
  });

  it('sorts segments by start index with missing values first', () => {
    const sorted = sortSegmentsByPosition([
      { start_index: 10 },
      {},
      { start_index: 5 },
    ]);

    expect(sorted.map((segment) => segment.start_index || 0)).toEqual([0, 5, 10]);
  });
});
