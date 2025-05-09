import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decode } from '@mapbox/polyline';

// Function to generate a random color
const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

// Function to generate a color based on segment ID
const getSegmentColor = (segmentId) => {
    // Use a hash function to generate a consistent color for each segment
    let hash = 0;
    for (let i = 0; i < segmentId.toString().length; i++) {
        hash = segmentId.toString().charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert hash to hex color
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

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
        console.log('Segments:', activity.segments);

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

        // Create polyline for the main route
        const mainRoute = L.polyline(decodedPoints, {
            color: '#666666',
            weight: 3,
            opacity: 0.7
        }).addTo(mapInstanceRef.current);

        // Add segments if available
        if (activity.segments && activity.segments.length > 0) {
            console.log('Processing segments:', activity.segments.length);
            activity.segments.forEach((segment, index) => {
                console.log(`Processing segment ${index}:`, {
                    name: segment.name,
                    segmentId: segment.segment?.id,
                    startLatlng: segment.segment?.start_latlng,
                    endLatlng: segment.segment?.end_latlng,
                    hasMap: !!segment.segment?.map,
                    hasPolyline: !!segment.segment?.map?.polyline,
                    effortStartIndex: segment.start_index,
                    effortEndIndex: segment.end_index
                });

                // If we have start and end indices, we can extract the segment from the main route
                if (segment.start_index !== undefined && segment.end_index !== undefined) {
                    const segmentPoints = decodedPoints.slice(segment.start_index, segment.end_index + 1);
                    const segmentColor = getSegmentColor(segment.segment.id);
                    console.log(`Segment ${index} color:`, segmentColor);
                    
                    L.polyline(segmentPoints, {
                        color: segmentColor,
                        weight: 5,
                        opacity: 0.8
                    }).addTo(mapInstanceRef.current)
                    .bindPopup(`<b>${segment.name}</b><br>${segment.segment.name}`);
                } else {
                    console.log(`Segment ${index} missing start/end indices`);
                }
            });
        } else {
            console.log('No segments found in activity data');
        }

        // Fit map to polyline bounds
        mapInstanceRef.current.fitBounds(mainRoute.getBounds());

        // Log the bounds
        console.log('Map bounds:', mainRoute.getBounds());

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