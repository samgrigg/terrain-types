import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Color generation utilities
export const generateSegmentColor = (segmentId) => {
    let hash = 0;
    for (let i = 0; i < segmentId.toString().length; i++) {
        hash = segmentId.toString().charCodeAt(i) + ((hash << 5) - hash);
    }
    
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

// Terrain data fetching and caching
export const fetchDetailedSegmentData = async (segment, tokens) => {
    if (!segment.segment.map?.polyline) {
        const segmentResponse = await axios.get(`${API_URL}/api/segment/${segment.segment.id}`, {
            params: {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: tokens.expires_at
            }
        });

        segment.segment = {
            ...segment.segment,
            ...segmentResponse.data
        };
    }
    return segment;
};

export const getCachedTerrainData = (segmentId) => {
    const cacheKey = `terrain_${segmentId}_v1`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            return data;
        }
    }
    return null;
};

export const cacheTerrainData = (segmentId, data) => {
    const cacheKey = `terrain_${segmentId}_v1`;
    localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
    }));
};

export const fetchTerrainData = async (segment) => {
    const response = await axios.post(`${API_URL}/api/terrain`, {
        start_lat: segment.start_latlng[0],
        start_lon: segment.start_latlng[1],
        end_lat: segment.end_latlng[0],
        end_lon: segment.end_latlng[1],
        polyline: segment.map?.polyline,
        distance_threshold: 0.0001
    });
    return response.data;
};

// Terrain data processing
export const calculateNaturalSurfacePercentage = (surfaces) => {
    if (!surfaces || surfaces.length === 0) return 0;
    
    const naturalSurfaces = ['gravel', 'wood', 'unpaved', 'dirt', 'ground', 'grass', 'sand', 'earth'];
    const naturalCount = surfaces.filter(surface => 
        naturalSurfaces.some(natural => surface.toLowerCase().includes(natural))
    ).length;
    
    return Math.round((naturalCount / surfaces.length) * 100);
};

export const formatTerrainInfo = (terrainData) => {
    if (!terrainData) return 'No terrain data available';

    const parts = [];
    
    if (terrainData.surfaces?.length > 0) {
        parts.push(`Surface: ${terrainData.surfaces.join(', ')}`);
    }
    if (terrainData.tracktypes?.length > 0) {
        parts.push(`Track Type: ${terrainData.tracktypes.join(', ')}`);
    }
    if (terrainData.highways?.length > 0) {
        parts.push(`Road Type: ${terrainData.highways.join(', ')}`);
    }
    if (terrainData.natural_percentage !== undefined) {
        parts.push(`Natural Surface: ${terrainData.natural_percentage}% of distance`);
    }

    return parts.join('<br>');
};

// Main terrain data fetching function
export const getTerrainData = async (segment, tokens) => {
    try {
        // Fetch detailed segment data if needed
        // await fetchDetailedSegmentData(segment, tokens);

        // Check for required data
        if (!segment.start_latlng || !segment.end_latlng) {
            console.warn('Segment missing start/end coordinates:', segment);
            return null;
        }

        // Check cache
        const cachedData = getCachedTerrainData(segment.id);
        if (cachedData) {
            return cachedData;
        }

        // Fetch and cache new data
        const terrainData = await fetchTerrainData(segment);
        cacheTerrainData(segment.id, terrainData);
        return terrainData;
    } catch (error) {
        console.error('Error fetching terrain data:', error);
        return null;
    }
}; 