import { decode } from '@mapbox/polyline';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const TERRAIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const generateSegmentColor = (segmentId) => {
  let hash = 0;
  for (let i = 0; i < segmentId.toString().length; i += 1) {
    hash = segmentId.toString().charCodeAt(i) + ((hash << 5) - hash);
  }

  let color = '#';
  for (let i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff;
    color += (`00${value.toString(16)}`).slice(-2);
  }
  return color.toUpperCase();
};

export const calculateNaturalSurfacePercentage = (surfaces) => {
  if (!surfaces || surfaces.length === 0) {
    return 0;
  }

  const naturalSurfaces = [
    'bridleway',
    'compacted',
    'dirt',
    'earth',
    'fine_gravel',
    'grass',
    'gravel',
    'ground',
    'mud',
    'path',
    'pebblestone',
    'rock',
    'sand',
    'track',
    'unpaved',
  ];

  const naturalCount = surfaces.filter((surface) => (
    naturalSurfaces.some((natural) => surface.toLowerCase().includes(natural))
  )).length;

  return Math.round((naturalCount / surfaces.length) * 100);
};

export const formatTerrainInfo = (terrainData) => {
  if (!terrainData) {
    return 'No terrain data available';
  }

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
    parts.push(`Unpaved Estimate: ${terrainData.natural_percentage}% of route`);
  }

  return parts.join('<br>');
};

export const getCachedTerrainData = (cacheKey) => {
  const cachedData = localStorage.getItem(`terrain_${cacheKey}_v2`);
  if (!cachedData) {
    return null;
  }

  const { data, timestamp } = JSON.parse(cachedData);
  if ((Date.now() - timestamp) > TERRAIN_CACHE_TTL_MS) {
    return null;
  }

  return data;
};

export const cacheTerrainData = (cacheKey, data) => {
  localStorage.setItem(`terrain_${cacheKey}_v2`, JSON.stringify({
    data,
    timestamp: Date.now(),
  }));
};

export const buildTerrainRequest = (route) => {
  const encodedPolyline = route?.polyline || route?.map?.polyline;
  if (encodedPolyline) {
    const decodedPoints = decode(encodedPolyline);
    if (decodedPoints.length >= 2) {
      return {
        start_lat: decodedPoints[0][0],
        start_lon: decodedPoints[0][1],
        end_lat: decodedPoints[decodedPoints.length - 1][0],
        end_lon: decodedPoints[decodedPoints.length - 1][1],
        polyline: encodedPolyline,
        distance_threshold: route?.distance_threshold ?? 25,
      };
    }
  }

  if (route?.start_latlng && route?.end_latlng) {
    return {
      start_lat: route.start_latlng[0],
      start_lon: route.start_latlng[1],
      end_lat: route.end_latlng[0],
      end_lon: route.end_latlng[1],
      polyline: encodedPolyline || null,
      distance_threshold: route?.distance_threshold ?? 25,
    };
  }

  return null;
};

export const fetchTerrainData = async (route) => {
  const payload = buildTerrainRequest(route);
  if (!payload) {
    return null;
  }

  const response = await fetch(`${API_URL}/api/terrain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch terrain data');
  }

  return response.json();
};

export const getTerrainData = async (route, cacheKey) => {
  if (!route) {
    return null;
  }

  const effectiveCacheKey = cacheKey || route.id;
  if (effectiveCacheKey) {
    const cachedData = getCachedTerrainData(effectiveCacheKey);
    if (cachedData) {
      return cachedData;
    }
  }

  const terrainData = await fetchTerrainData(route);
  if (terrainData && effectiveCacheKey) {
    cacheTerrainData(effectiveCacheKey, terrainData);
  }
  return terrainData;
};
