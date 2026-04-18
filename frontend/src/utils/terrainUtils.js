import { decode } from '@mapbox/polyline';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const TERRAIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Dull gray: no match, loading, or error */
export const TERRAIN_COLOR_FALLBACK = '#8E8E8E';

/** Light gray while segment terrain is still loading */
export const TERRAIN_COLOR_LOADING = '#B5B5B5';

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

/**
 * Dominant OSM surface for this stretch (longest distance in surface_distances).
 */
export const dominantSurfaceFromTerrain = (terrainData) => {
  if (!terrainData?.surface_distances || typeof terrainData.surface_distances !== 'object') {
    return null;
  }
  const entries = Object.entries(terrainData.surface_distances);
  if (entries.length === 0) {
    return null;
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
};

/**
 * Map normalized surface / track labels to line colors (muted, map-readable).
 */
export const colorForSurface = (surfaceName) => {
  if (!surfaceName || surfaceName === 'unknown') {
    return TERRAIN_COLOR_FALLBACK;
  }
  const s = surfaceName.toLowerCase();

  if (/(asphalt|concrete|paved|paving|tarmac|bitumen|cobblestone|sett|metal|chipseal)/.test(s)) {
    return '#1A1A1A';
  }
  if (/(dirt|earth|mud|soil|ground|clay|laterite)/.test(s)) {
    return '#8B5A2B';
  }
  if (/(sand)/.test(s)) {
    return '#C9A86C';
  }
  if (/(gravel|fine_gravel|pebblestone|compacted|scree)/.test(s)) {
    return '#A68F72';
  }
  if (/track_grade/.test(s)) {
    return '#7A5230';
  }
  if (/(grass|turf|artificial_turf)/.test(s)) {
    return '#4A7A3F';
  }
  if (/(rock|bedrock|stone)/.test(s)) {
    return '#6B7580';
  }
  if (/(wood|woodchips|mulch)/.test(s)) {
    return '#7D6040';
  }
  if (/(ice|snow|salt)/.test(s)) {
    return '#B8C8D8';
  }
  if (/(water|wet)/.test(s)) {
    return '#4A90A4';
  }
  if (/(brick)/.test(s)) {
    return '#6E4A3A';
  }
  if (/(stepping_stones|unhewn_cobble)/.test(s)) {
    return '#5C6670';
  }

  return TERRAIN_COLOR_FALLBACK;
};

export const colorForTerrainData = (terrainData) => {
  const surface = dominantSurfaceFromTerrain(terrainData);
  return colorForSurface(surface);
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
    let detail = `Terrain request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail !== undefined) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
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
