function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function cumulativeVertexDistances(points) {
  if (!points?.length) {
    return [];
  }
  const out = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [lat0, lon0] = points[i - 1];
    const [lat1, lon1] = points[i];
    const seg = haversineMeters(lat0, lon0, lat1, lon1);
    out.push(out[i - 1] + seg);
  }
  return out;
}

function interpolateAltitudeAtDistance(streams, distM) {
  const distArr = streams?.distance?.data;
  const altArr = streams?.altitude?.data;
  if (!distArr?.length || !altArr?.length || distArr.length !== altArr.length) {
    return null;
  }
  if (distM <= distArr[0]) {
    return altArr[0];
  }
  const last = distArr.length - 1;
  if (distM >= distArr[last]) {
    return altArr[last];
  }
  let i = 0;
  while (i < last && distArr[i + 1] < distM) {
    i += 1;
  }
  const d0 = distArr[i];
  const d1 = distArr[i + 1];
  const a0 = altArr[i];
  const a1 = altArr[i + 1];
  const span = d1 - d0;
  const t = span > 0 ? (distM - d0) / span : 0;
  return a0 + t * (a1 - a0);
}

/**
 * Average grade % for a terrain run using Strava streams sampled along activity distance.
 * @param {Array<[number, number]>} decodedPolylinePoints lat, lon
 * @param {object|null} streams Strava key_by_type payload
 * @param {{ start_index: number, end_index: number }} run
 * @returns {number|null}
 */
export function averageGradePercentForRun(decodedPolylinePoints, streams, run) {
  if (!decodedPolylinePoints?.length || !run || streams == null) {
    return null;
  }
  const { start_index: si, end_index: ei } = run;
  if (
    si < 0
    || ei < si
    || ei >= decodedPolylinePoints.length
  ) {
    return null;
  }
  const cum = cumulativeVertexDistances(decodedPolylinePoints);
  const dStart = cum[si];
  const dEnd = cum[ei];
  const horiz = dEnd - dStart;
  if (horiz <= 1e-3) {
    return null;
  }
  const altStart = interpolateAltitudeAtDistance(streams, dStart);
  const altEnd = interpolateAltitudeAtDistance(streams, dEnd);
  if (altStart == null || altEnd == null) {
    return null;
  }
  return ((altEnd - altStart) / horiz) * 100;
}
