/**
 * Project WGS84 points into a centered, north-up SVG using local geographic proportions.
 * @param {Array<[number, number]>} points
 * @param {number} width
 * @param {number} height
 * @param {number} padding
 * @returns {{ project: (p: [number, number]) => [number, number], width: number, height: number } | null}
 */
export function buildSvgProjection(points, width, height, padding = 4) {
  if (!points || points.length < 2) {
    return null;
  }
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  // Longitude degrees get shorter toward the poles. A local projection keeps
  // ride-sized routes recognizable without adding a map dependency.
  const longitudeScale = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const latSpan = maxLat - minLat;
  const lonSpan = (maxLon - minLon) * longitudeScale;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = Math.min(innerW / Math.max(lonSpan, 1e-8), innerH / Math.max(latSpan, 1e-8));
  const offsetX = (width - lonSpan * scale) / 2;
  const offsetY = (height - latSpan * scale) / 2;

  const project = ([lat, lon]) => {
    const x = offsetX + (lon - minLon) * longitudeScale * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return [x, y];
  };

  return { project, width, height };
}

/**
 * @param {(p: [number, number]) => [number, number]} project
 * @param {Array<[number, number]>} slice
 */
export function pointsToPathD(project, slice) {
  if (!slice || slice.length < 2) {
    return '';
  }
  const [x0, y0] = project(slice[0]);
  let d = `M ${x0.toFixed(2)} ${y0.toFixed(2)}`;
  for (let i = 1; i < slice.length; i += 1) {
    const [x, y] = project(slice[i]);
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}
