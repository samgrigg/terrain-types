import React from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { BUCKET_COLORS } from '../utils/terrainUtils';

const MI_PER_M = 1 / 1609.344;

function stripeColor(bucket) {
  return BUCKET_COLORS[bucket] || BUCKET_COLORS.unknown;
}

function labelForBucket(bucket) {
  if (bucket === 'paved') return 'Paved';
  if (bucket === 'dirt') return 'Dirt';
  return 'Unknown';
}

/**
 * Breakdown of contiguous terrain buckets along the route.
 */
function TerrainRunsTable({ runs, segmentLabelForRun, gradeLabelForRun, loading }) {
  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Terrain segments
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Loading breakdown…
        </Typography>
      </Paper>
    );
  }

  if (!runs?.length) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Terrain segments
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Terrain breakdown unavailable for this route.
        </Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 8 }} aria-label="Terrain color" />
            <TableCell>Mi</TableCell>
            <TableCell>Segments</TableCell>
            <TableCell align="right">Grade</TableCell>
            <TableCell>Type</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={`${run.start_index}-${run.end_index}-${run.bucket}`}>
              <TableCell sx={{ p: 0.5, borderBottom: 0, verticalAlign: 'middle' }}>
                <div
                  style={{
                    width: 6,
                    minHeight: 36,
                    borderRadius: 2,
                    backgroundColor: stripeColor(run.bucket),
                  }}
                />
              </TableCell>
              <TableCell>{(run.distance_m * MI_PER_M).toFixed(1)}</TableCell>
              <TableCell>{segmentLabelForRun(run)}</TableCell>
              <TableCell align="right">{gradeLabelForRun(run)}</TableCell>
              <TableCell>{labelForBucket(run.bucket)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default TerrainRunsTable;
