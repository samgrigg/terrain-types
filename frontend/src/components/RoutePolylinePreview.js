import React, { useEffect, useMemo, useRef } from 'react';
import { decode } from '@mapbox/polyline';
import { Box, Typography } from '@mui/material';
import { getTerrainData } from '../utils/terrainUtils';
import { buildSvgProjection, pointsToPathD } from '../utils/polylinePreview';

const SVG_W = 320;
const SVG_H = 72;

/**
 * A compact route silhouette for feed cards (summary or full polyline).
 */
function RoutePolylinePreview({ encodedPolyline, activityId, muted, onTerrainLoaded }) {
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
      onTerrainLoadedRef.current?.({ runs: null });
      return undefined;
    }

    const load = async () => {
      try {
        const terrain = await getTerrainData(
          { id: activityId, polyline: encodedPolyline, distance_threshold: 25 },
          activityId != null ? `activity_${activityId}` : undefined,
        );
        if (!cancelled) {
          const nextRuns = terrain?.runs || [];
          onTerrainLoadedRef.current?.({ runs: nextRuns });
        }
      } catch {
        if (!cancelled) {
          onTerrainLoadedRef.current?.({ runs: [] });
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

  return (
    <Box
      sx={{
        height: SVG_H,
        borderRadius: 1,
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
        <path
          d={pointsToPathD(project, points)}
          fill="none"
          stroke="#FC4C02"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </Box>
  );
}

export default RoutePolylinePreview;
