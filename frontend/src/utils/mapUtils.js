import L from 'leaflet';
import { decode } from '@mapbox/polyline';
import { generateSegmentColor } from './terrainUtils';

export const initializeMap = (mapRef) => {
    const map = L.map(mapRef).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    return map;
};

export const clearMapLayers = (map) => {
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });
};

export const createMainRoutePolyline = (map, decodedPoints) => {
    return L.polyline(decodedPoints, {
        color: '#666666',
        weight: 3,
        opacity: 0.5
    }).addTo(map);
};

export const createSegmentPolyline = (map, points, segment, isSelected) => {
    const color = isSelected ? '#ff0000' : generateSegmentColor(segment.segment.id);
    return L.polyline(points, {
        color,
        weight: isSelected ? 7 : 5,
        opacity: isSelected ? 0.9 : 0.7
    }).addTo(map);
};

export const createSegmentPopup = (segment, index, totalSegments, terrainInfo) => {
    return `
        <b>${segment.name}</b><br>
        ${segment.segment.name}<br>
        Length: ${(segment.segment.distance / 1000).toFixed(2)} km<br>
        Position: ${index + 1} of ${totalSegments}<br>
        <br>
        <b>Terrain Information:</b><br>
        ${terrainInfo}
    `;
};

export const fitMapToSegment = (map, points) => {
    const polyline = L.polyline(points);
    map.fitBounds(polyline.getBounds());
};

export const processActivityData = (activity) => {
    if (!activity?.map?.polyline) {
        return null;
    }
    return decode(activity.map.polyline);
};

export const sortSegmentsByPosition = (segments) => {
    return [...segments].sort((a, b) => {
        const startA = a.start_index || 0;
        const startB = b.start_index || 0;
        return startA - startB;
    });
}; 