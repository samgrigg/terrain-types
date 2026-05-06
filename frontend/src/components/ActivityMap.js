import React, { useEffect, useMemo, useRef, useState } from 'react';
import { encode } from '@mapbox/polyline';
import {
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import {
  colorForTerrainData,
  getTerrainData,
  TERRAIN_COLOR_LOADING,
} from '../utils/terrainUtils';
import {
  clearMapLayers,
  createMainRoutePolyline,
  createSegmentPolyline,
  initializeMap,
  processActivityData,
  sortSegmentsByPosition,
} from '../utils/mapUtils';

const formatDistance = (distanceMeters) => `${(distanceMeters / 1000).toFixed(1)} km`;

const summarizeSurfaceDistances = (surfaceDistances = {}) => (
  Object.entries(surfaceDistances)
    .slice(0, 3)
    .map(([surface, distance]) => `${surface}: ${formatDistance(distance)}`)
    .join(', ')
);

const ActivityMap = ({ activity }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [activityTerrain, setActivityTerrain] = useState(null);
  const [activityTerrainLoading, setActivityTerrainLoading] = useState(false);
  const [segmentTerrainById, setSegmentTerrainById] = useState({});

  const decodedPoints = useMemo(
    () => processActivityData(activity),
    [activity?.map?.polyline],
  );
  const sortedSegments = useMemo(
    () => sortSegmentsByPosition(activity?.segments || []),
    [activity?.segments],
  );

  useEffect(() => {
    let cancelled = false;

    const loadActivityTerrain = async () => {
      if (!activity?.map?.polyline) {
        setActivityTerrain(null);
        return;
      }

      setActivityTerrainLoading(true);
      try {
        const terrain = await getTerrainData(
          { id: activity.id, polyline: activity.map.polyline, distance_threshold: 25 },
          `activity_${activity.id}`,
        );
        if (!cancelled) {
          setActivityTerrain(terrain);
        }
      } catch (error) {
        if (!cancelled) {
          setActivityTerrain(null);
        }
        console.error('Failed to load activity terrain:', error);
      } finally {
        if (!cancelled) {
          setActivityTerrainLoading(false);
        }
      }
    };

    loadActivityTerrain();

    return () => {
      cancelled = true;
    };
  }, [activity]);

  useEffect(() => {
    let cancelled = false;

    if (!activity?.id || !decodedPoints || sortedSegments.length === 0) {
      setSegmentTerrainById({});
      return undefined;
    }

    const loadSegmentTerrains = async () => {
      const pairs = await Promise.all(
        sortedSegments.map(async (seg) => {
          const segmentPoints = decodedPoints.slice(seg.start_index, seg.end_index + 1);
          if (segmentPoints.length < 2) {
            return [seg.segment.id, null];
          }
          const polyline = encode(segmentPoints);
          try {
            const terrain = await getTerrainData(
              { id: seg.segment.id, polyline, distance_threshold: 25 },
              `segment_${seg.segment.id}`,
            );
            return [seg.segment.id, terrain];
          } catch {
            return [seg.segment.id, null];
          }
        }),
      );
      if (!cancelled) {
        setSegmentTerrainById(Object.fromEntries(pairs));
      }
    };

    loadSegmentTerrains();

    return () => {
      cancelled = true;
    };
  }, [activity?.id, decodedPoints, sortedSegments]);

  useEffect(() => {
    if (!decodedPoints) {
      return undefined;
    }

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = initializeMap(mapRef.current);
    }

    clearMapLayers(mapInstanceRef.current);
    const mainRoute = createMainRoutePolyline(mapInstanceRef.current, decodedPoints);

    sortedSegments.forEach((segment) => {
      const segmentPoints = decodedPoints.slice(segment.start_index, segment.end_index + 1);
      if (segmentPoints.length < 2) {
        return;
      }

      const terrainRow = segmentTerrainById[segment.segment.id];
      const lineColor = terrainRow === undefined
        ? TERRAIN_COLOR_LOADING
        : colorForTerrainData(terrainRow);
      createSegmentPolyline(mapInstanceRef.current, segmentPoints, lineColor);
    });

    const map = mapInstanceRef.current;
    const applyBounds = () => {
      map.invalidateSize();
      map.fitBounds(mainRoute.getBounds());
    };
    requestAnimationFrame(applyBounds);

    return undefined;
  }, [decodedPoints, sortedSegments, segmentTerrainById]);

  return (
    <Box>
      <div
        ref={mapRef}
        style={{
          height: '400px',
          width: '100%',
          marginTop: '20px',
          marginBottom: '20px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          position: 'relative',
          zIndex: 0,
        }}
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Ride Terrain Estimate
        </Typography>
        {activityTerrainLoading ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        ) : activityTerrain ? (
          <>
            <Typography variant="body1">
              Unpaved estimate: {activityTerrain.natural_percentage}% of route
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Matched {formatDistance(activityTerrain.matched_distance)} of {formatDistance(activityTerrain.total_distance)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Top surfaces: {summarizeSurfaceDistances(activityTerrain.surface_distances) || 'No surface tags found'}
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Terrain data is unavailable for this activity.
          </Typography>
        )}
      </Paper>

      <Typography variant="h6" gutterBottom>
        Activity Segments ({sortedSegments.length})
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Name</TableCell>
              <TableCell align="right">Distance</TableCell>
              <TableCell align="right">Grade</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedSegments.map((segment, index) => (
              <TableRow key={segment.segment.id} hover>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{segment.segment.name}</TableCell>
                <TableCell align="right">{formatDistance(segment.segment.distance)}</TableCell>
                <TableCell align="right">{segment.segment.average_grade?.toFixed(1) ?? '0.0'}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

    </Box>
  );
};

export default ActivityMap;
