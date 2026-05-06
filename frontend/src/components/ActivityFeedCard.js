import React, { useCallback, useState } from 'react';
import { Card, CardActionArea, Typography, Box } from '@mui/material';
import RoutePolylinePreview from './RoutePolylinePreview';
import { dirtMilesFromRuns } from '../utils/terrainUtils';

function ActivityFeedCard({ activity, riderName, selected, onSelect }) {
  const [dirtMi, setDirtMi] = useState(null);
  const hasPolyline = Boolean(activity.summary_polyline);

  const handleTerrainLoaded = useCallback(({ runs }) => {
    setDirtMi(dirtMilesFromRuns(runs));
  }, []);

  const distanceMi = (activity.distance || 0) / 1609.344;

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
      }}
    >
      <CardActionArea onClick={() => onSelect(activity)} sx={{ alignItems: 'stretch', p: 1.5 }}>
        <Box sx={{ width: '100%' }}>
          <Typography variant="subtitle2" component="div" fontWeight={600}>
            {riderName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {activity.name}
          </Typography>
          <RoutePolylinePreview
            encodedPolyline={activity.summary_polyline}
            activityId={activity.id}
            muted={!hasPolyline}
            onTerrainLoaded={handleTerrainLoaded}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>{distanceMi.toFixed(1)}</strong> mi
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dirtMi == null ? (
                <span>dirt —</span>
              ) : (
                <span>
                  dirt <strong style={{ color: '#C4822A' }}>{dirtMi.toFixed(1)}</strong> mi
                </span>
              )}
            </Typography>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export default ActivityFeedCard;
