import React, { useEffect, useRef, useState } from 'react';
import { encode } from '@mapbox/polyline';
import {
  Box,
  CircularProgress,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import WayMatchDetails from './WayMatchDetails';
import { formatTerrainInfo, getTerrainData } from '../utils/terrainUtils';
import {
  clearMapLayers,
  createMainRoutePolyline,
  createSegmentPolyline,
  createSegmentPopup,
  fitMapToSegment,
  initializeMap,
  processActivityData,
  sortSegmentsByPosition,
} from '../utils/mapUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const formatDistance = (distanceMeters) => `${(distanceMeters / 1000).toFixed(1)} km`;

const summarizeSurfaceDistances = (surfaceDistances = {}) => (
  Object.entries(surfaceDistances)
    .slice(0, 3)
    .map(([surface, distance]) => `${surface}: ${formatDistance(distance)}`)
    .join(', ')
);

const ActivityMap = ({ activity, selectedSegmentId, onSegmentClick }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [activityTerrain, setActivityTerrain] = useState(null);
  const [activityTerrainLoading, setActivityTerrainLoading] = useState(false);
  const [selectedSegmentTerrain, setSelectedSegmentTerrain] = useState(null);
  const [selectedSegmentTerrainLoading, setSelectedSegmentTerrainLoading] = useState(false);
  const [wayMatches, setWayMatches] = useState([]);
  const [wayMatchesLoading, setWayMatchesLoading] = useState(false);

  const decodedPoints = processActivityData(activity);
  const sortedSegments = sortSegmentsByPosition(activity?.segments || []);
  const selectedSegment = sortedSegments.find(
    (segment) => segment.segment.id.toString() === selectedSegmentId,
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

    const loadSelectedSegmentTerrain = async () => {
      if (!selectedSegment || !decodedPoints) {
        setSelectedSegmentTerrain(null);
        setSelectedSegmentTerrainLoading(false);
        setWayMatches([]);
        setWayMatchesLoading(false);
        return;
      }

      const segmentPoints = decodedPoints.slice(
        selectedSegment.start_index,
        selectedSegment.end_index + 1,
      );
      if (segmentPoints.length < 2) {
        setSelectedSegmentTerrain(null);
        setSelectedSegmentTerrainLoading(false);
        setWayMatches([]);
        setWayMatchesLoading(false);
        return;
      }

      const polyline = encode(segmentPoints);
      setSelectedSegmentTerrainLoading(true);
      try {
        const terrain = await getTerrainData(
          {
            id: selectedSegment.segment.id,
            polyline,
            distance_threshold: 25,
          },
          `segment_${selectedSegment.segment.id}`,
        );
        if (!cancelled) {
          setSelectedSegmentTerrain(terrain);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedSegmentTerrain(null);
        }
        console.error('Failed to load selected segment terrain:', error);
      } finally {
        if (!cancelled) {
          setSelectedSegmentTerrainLoading(false);
        }
      }

      const accessToken = localStorage.getItem('strava_token');
      if (!accessToken) {
        setWayMatches([]);
        setWayMatchesLoading(false);
        return;
      }

      setWayMatchesLoading(true);
      try {
        const response = await fetch(`${API_URL}/osm/match/${selectedSegment.segment.id}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) {
          throw new Error('Failed to fetch OSM way matches');
        }
        const matches = await response.json();
        if (!cancelled) {
          setWayMatches(matches);
        }
      } catch (error) {
        if (!cancelled) {
          setWayMatches([]);
        }
        console.error('Failed to load way matches:', error);
      } finally {
        if (!cancelled) {
          setWayMatchesLoading(false);
        }
      }
    };

    loadSelectedSegmentTerrain();

    return () => {
      cancelled = true;
    };
  }, [decodedPoints, selectedSegment]);

  useEffect(() => {
    if (!decodedPoints) {
      return undefined;
    }

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = initializeMap(mapRef.current);
    }

    clearMapLayers(mapInstanceRef.current);
    const mainRoute = createMainRoutePolyline(mapInstanceRef.current, decodedPoints);
    const selectedTerrainLabel = formatTerrainInfo(selectedSegmentTerrain);

    sortedSegments.forEach((segment, index) => {
      const segmentPoints = decodedPoints.slice(segment.start_index, segment.end_index + 1);
      if (segmentPoints.length < 2) {
        return;
      }

      const isSelected = selectedSegmentId === segment.segment.id.toString();
      const polyline = createSegmentPolyline(
        mapInstanceRef.current,
        segmentPoints,
        segment,
        isSelected,
      );

      polyline.on('click', () => onSegmentClick(segment.segment.id));

      if (isSelected) {
        polyline.bindPopup(
          createSegmentPopup(segment, index, sortedSegments.length, selectedTerrainLabel),
        );
      }
    });

    const map = mapInstanceRef.current;
    const applyBounds = () => {
      map.invalidateSize();
      if (selectedSegment) {
        const selectedPoints = decodedPoints.slice(
          selectedSegment.start_index,
          selectedSegment.end_index + 1,
        );
        fitMapToSegment(map, selectedPoints);
      } else {
        map.fitBounds(mainRoute.getBounds());
      }
    };
    requestAnimationFrame(applyBounds);

    return undefined;
  }, [decodedPoints, onSegmentClick, selectedSegment, selectedSegmentId, selectedSegmentTerrain, sortedSegments]);

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
            {sortedSegments.map((segment, index) => {
              const isSelected = selectedSegmentId === segment.segment.id.toString();
              return (
                <TableRow
                  key={segment.segment.id}
                  hover
                  selected={isSelected}
                  onClick={() => onSegmentClick(segment.segment.id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{segment.segment.name}</TableCell>
                  <TableCell align="right">{formatDistance(segment.segment.distance)}</TableCell>
                  <TableCell align="right">{segment.segment.average_grade?.toFixed(1) ?? '0.0'}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedSegment && (
        <>
          <Divider sx={{ my: 2 }} />
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Selected Segment Terrain
            </Typography>
            {selectedSegmentTerrainLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : selectedSegmentTerrain ? (
              <>
                <Typography variant="body1">
                  Unpaved estimate: {selectedSegmentTerrain.natural_percentage}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {summarizeSurfaceDistances(selectedSegmentTerrain.surface_distances) || 'No surface tags found'}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Terrain data is unavailable for this segment.
              </Typography>
            )}
          </Paper>

          {wayMatchesLoading ? (
            <Box display="flex" justifyContent="center" py={2}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <WayMatchDetails matches={wayMatches} />
          )}
        </>
      )}
    </Box>
  );
};

export default ActivityMap;
