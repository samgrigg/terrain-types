import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decode } from '@mapbox/polyline';

const ActivityMap = ({ activity }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    useEffect(() => {
        if (!activity || !activity.map || !activity.map.polyline) {
            console.log('No activity or polyline data available:', activity);
            return;
        }

        console.log('Raw activity data:', activity);
        console.log('Polyline data:', activity.map.polyline);

        // Decode the polyline
        const decodedPoints = decode(activity.map.polyline);
        console.log('Decoded points:', decodedPoints);

        // Initialize map if it doesn't exist
        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(mapInstanceRef.current);
        }

        // Clear existing layers
        mapInstanceRef.current.eachLayer((layer) => {
            if (layer instanceof L.Polyline) {
                mapInstanceRef.current.removeLayer(layer);
            }
        });

        // Create polyline from decoded points
        const polyline = L.polyline(decodedPoints, {
            color: 'red',
            weight: 3,
            opacity: 0.7
        }).addTo(mapInstanceRef.current);

        // Fit map to polyline bounds
        mapInstanceRef.current.fitBounds(polyline.getBounds());

        // Log the bounds
        console.log('Map bounds:', polyline.getBounds());

    }, [activity]);

    return (
        <div 
            ref={mapRef} 
            style={{ 
                height: '400px', 
                width: '100%',
                marginTop: '20px',
                border: '1px solid #ccc',
                borderRadius: '4px'
            }}
        />
    );
};

export default ActivityMap; 