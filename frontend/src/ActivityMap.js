import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Box } from '@mui/material';

// Fix for default marker icons in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to fit the map bounds to the route
function FitBounds({ positions }) {
  const map = useMap();
  
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, positions]);

  return null;
}

function ActivityMap({ activity }) {
  // Extract the route points from the activity
  const routePoints = activity.map?.polyline
    ? decodePolyline(activity.map.polyline)
    : [];

  if (routePoints.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        No route data available for this activity
      </Box>
    );
  }

  return (
    <Box sx={{ height: '500px', width: '100%' }}>
      <MapContainer
        style={{ height: '100%', width: '100%' }}
        center={routePoints[0]}
        zoom={13}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={routePoints}
          pathOptions={{ color: '#FC4C02', weight: 3 }}
        />
        <FitBounds positions={routePoints} />
      </MapContainer>
    </Box>
  );
}

// Function to decode Strava's polyline format
function decodePolyline(polyline) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < polyline.length) {
    let shift = 0;
    let result = 0;

    do {
      let b = polyline.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);

    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      let b = polyline.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);

    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    // Swap lat/lng order to match Leaflet's expected format [lat, lng]
    points.push([lat * 1e-5, lng * 1e-5]);
  }

  return points;
}

export default ActivityMap; 