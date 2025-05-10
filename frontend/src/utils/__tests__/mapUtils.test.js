import L from 'leaflet';
import {
    initializeMap,
    clearMapLayers,
    createMainRoutePolyline,
    createSegmentPolyline,
    createSegmentPopup,
    fitMapToSegment,
    processActivityData,
    sortSegmentsByPosition
} from '../mapUtils';

// Mock Leaflet
jest.mock('leaflet', () => ({
    map: jest.fn(() => ({
        setView: jest.fn().mockReturnThis(),
        eachLayer: jest.fn(),
        removeLayer: jest.fn(),
        fitBounds: jest.fn()
    })),
    tileLayer: jest.fn(() => ({
        addTo: jest.fn()
    })),
    polyline: jest.fn(() => ({
        addTo: jest.fn(),
        getBounds: jest.fn(() => ({
            extend: jest.fn()
        }))
    }))
}));

describe('mapUtils', () => {
    let mockMapRef;
    let mockMap;

    beforeEach(() => {
        mockMapRef = document.createElement('div');
        mockMap = L.map();
    });

    describe('initializeMap', () => {
        it('should initialize a map with default settings', () => {
            const map = initializeMap(mockMapRef);
            expect(L.map).toHaveBeenCalledWith(mockMapRef);
            expect(map.setView).toHaveBeenCalledWith([0, 0], 2);
            expect(L.tileLayer).toHaveBeenCalledWith(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                expect.any(Object)
            );
        });
    });

    describe('clearMapLayers', () => {
        it('should remove all polyline layers', () => {
            const mockLayer = { instanceof: jest.fn(() => true) };
            mockMap.eachLayer.mockImplementation(callback => callback(mockLayer));
            
            clearMapLayers(mockMap);
            expect(mockMap.eachLayer).toHaveBeenCalled();
            expect(mockMap.removeLayer).toHaveBeenCalledWith(mockLayer);
        });
    });

    describe('createMainRoutePolyline', () => {
        it('should create a polyline with correct styling', () => {
            const points = [[0, 0], [1, 1]];
            createMainRoutePolyline(mockMap, points);
            
            expect(L.polyline).toHaveBeenCalledWith(points, {
                color: '#666666',
                weight: 3,
                opacity: 0.5
            });
        });
    });

    describe('createSegmentPolyline', () => {
        it('should create a polyline with correct styling for selected segment', () => {
            const points = [[0, 0], [1, 1]];
            const segment = { segment: { id: 123 } };
            
            createSegmentPolyline(mockMap, points, segment, true);
            
            expect(L.polyline).toHaveBeenCalledWith(points, {
                color: '#ff0000',
                weight: 7,
                opacity: 0.9
            });
        });

        it('should create a polyline with correct styling for unselected segment', () => {
            const points = [[0, 0], [1, 1]];
            const segment = { segment: { id: 123 } };
            
            createSegmentPolyline(mockMap, points, segment, false);
            
            expect(L.polyline).toHaveBeenCalledWith(points, {
                color: expect.any(String),
                weight: 5,
                opacity: 0.7
            });
        });
    });

    describe('createSegmentPopup', () => {
        it('should create popup with correct content', () => {
            const segment = {
                name: 'Test Segment',
                segment: {
                    name: 'Segment Name',
                    distance: 1000
                }
            };
            const terrainInfo = 'Surface: gravel';
            
            const popup = createSegmentPopup(segment, 0, 5, terrainInfo);
            
            expect(popup).toContain('Test Segment');
            expect(popup).toContain('Segment Name');
            expect(popup).toContain('1.00 km');
            expect(popup).toContain('Position: 1 of 5');
            expect(popup).toContain(terrainInfo);
        });
    });

    describe('fitMapToSegment', () => {
        it('should fit map to segment bounds', () => {
            const points = [[0, 0], [1, 1]];
            fitMapToSegment(mockMap, points);
            
            expect(L.polyline).toHaveBeenCalledWith(points);
            expect(mockMap.fitBounds).toHaveBeenCalled();
        });
    });

    describe('processActivityData', () => {
        it('should return null for invalid activity data', () => {
            expect(processActivityData(null)).toBeNull();
            expect(processActivityData({})).toBeNull();
            expect(processActivityData({ map: {} })).toBeNull();
        });

        it('should decode polyline data', () => {
            const activity = {
                map: {
                    polyline: 'test_polyline'
                }
            };
            const result = processActivityData(activity);
            expect(result).toBeDefined();
        });
    });

    describe('sortSegmentsByPosition', () => {
        it('should sort segments by start_index', () => {
            const segments = [
                { start_index: 10, end_index: 20 },
                { start_index: 0, end_index: 5 },
                { start_index: 5, end_index: 10 }
            ];
            
            const sorted = sortSegmentsByPosition(segments);
            
            expect(sorted[0].start_index).toBe(0);
            expect(sorted[1].start_index).toBe(5);
            expect(sorted[2].start_index).toBe(10);
        });

        it('should handle segments with missing start_index', () => {
            const segments = [
                { start_index: 10, end_index: 20 },
                { end_index: 5 },
                { start_index: 5, end_index: 10 }
            ];
            
            const sorted = sortSegmentsByPosition(segments);
            
            expect(sorted[0].start_index).toBe(0);
            expect(sorted[1].start_index).toBe(5);
            expect(sorted[2].start_index).toBe(10);
        });
    });
}); 