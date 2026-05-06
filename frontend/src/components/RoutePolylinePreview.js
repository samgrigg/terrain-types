import React, { useEffect, useMemo, useRef, useState } from 'react';
import { decode } from '@mapbox/polyline';
import { Box, Typography } from '@mui/material';
import { BUCKET_COLORS, getTerrainData, TERRAIN_COLOR_LOADING } from '../utils/terrainUtils';
import { buildSvgProjection, pointsToPathD } from '../utils/polylinePreview';

const SVG_W = 320;
const SVG_H = 72;

/**
 * Terrain-colored polyline preview for feed cards (summary or full polyline).
 */
function RoutePolylinePreview({ encodedPolyline, activityId, muted, onTerrainLoaded }) {
  const [runs, setRuns] = useState(null);
  const [loading, setLoading] = useState(false);
  const onTerrainLoadedRef = useRef(onTerrainLoaded);
  useEffect(() => {
    onTerrainLoadedRef.current = onTerrainLoaded;
  }, [onTerrainLoaded]);

  const points = useMemo(() => {
    if (!encodedPolyline) {
      return null;
    }
    try {
      const decoded = decode(encodedPolyline);
      return decoded.length >= 2 ? decoded : null;
    } catch {
      return null;
    }
  }, [encodedPolyline]);

  useEffect(() => {
    let cancelled = false;
    if (!points || !encodedPolyline) {
      setRuns(null);
      setLoading(false);
      onTerrainLoadedRef.current?.({ runs: null });
      return undefined;
    }

    const load = async () => {
      setLoading(true);
      try {
        const terrain = await getTerrainData(
          { id: activityId, polyline: encodedPolyline, distance_threshold: 25 },
          activityId != null ? `activity_${activityId}` : undefined,
        );
        if (!cancelled) {
          const nextRuns = terrain?.runs || [];
          setRuns(nextRuns);
          onTerrainLoadedRef.current?.({ runs: nextRuns });
        }
      } catch {
        if (!cancelled) {
          setRuns([]);
          onTerrainLoadedRef.current?.({ runs: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [points, encodedPolyline, activityId]);

  const projection = useMemo(() => buildSvgProjection(points, SVG_W, SVG_H), [points]);

  if (!points || !projection) {
    return (
      <Box
        sx={{
          height: SVG_H,
          borderRadius: 1,
          bgcolor: muted ? 'action.hover' : 'grey.200',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          No route
        </Typography>
      </Box>
    );
  }

  const { project } = projection;

  let paths;
  if (loading || runs === null) {
    paths = (
      <path
        d={pointsToPathD(project, points)}
        fill="none"
        stroke={TERRAIN_COLOR_LOADING}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  } else if (!runs.length) {
    paths = (
      <path
        d={pointsToPathD(project, points)}
        fill="none"
        stroke={BUCKET_COLORS.unknown}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  } else {
    paths = runs.map((run) => {
      const slice = points.slice(run.start_index, run.end_index + 1);
      const d = pointsToPathD(project, slice);
      if (!d) {
        return null;
      }
      const stroke = BUCKET_COLORS[run.bucket] || BUCKET_COLORS.unknown;
      return (
        <path
          key={`${run.start_index}-${run.end_index}-${run.bucket}`}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });
  }

  return (
    <Box
      sx={{
        height: SVG_H,
        borderRadius: 1,
        bgcolor: 'grey.200',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: muted ? 0.65 : 1,
      }}
    >
      <svg
        width="100%"
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {paths}
      </svg>
    </Box>
  );
}

export default RoutePolylinePreview;
