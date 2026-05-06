import * as L from 'leaflet';
import { decode } from '@mapbox/polyline';

export const initializeMap = (mapRef) => {
    const map = L.map(mapRef).setView([0, 0], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
    }).addTo(map);
    return map;
};

export const clearMapLayers = (map) => {
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline || typeof layer.getLatLngs === 'function') {
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

export const createSegmentPolyline = (map, points, lineColor) => {
    return L.polyline(points, {
        color: lineColor ?? '#8E8E8E',
        weight: 5,
        opacity: 0.7,
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
    if (!points || points.length < 2) {
        return;
    }
    const polyline = L.polyline(points);
    map.fitBounds(polyline.getBounds());
};

export const processActivityData = (activity) => {
    if (!activity?.map?.polyline) {
        return null;
    }
    try {
        return decode(activity.map.polyline);
    } catch (error) {
        return null;
    }
};

export const sortSegmentsByPosition = (segments) => {
    return [...segments].sort((a, b) => {
        const startA = a.start_index || 0;
        const startB = b.start_index || 0;
        return startA - startB;
    });
}; 
