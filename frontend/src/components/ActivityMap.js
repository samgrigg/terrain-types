import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decode } from '@mapbox/polyline';
import axios from 'axios';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Typography,
    Box,
    CircularProgress
} from '@mui/material';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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

// Function to get terrain data with caching
const getTerrainData = async (segment, tokens) => {
    try {
        // First, fetch detailed segment data if we don't have it
        if (!segment.segment.map?.polyline) {
            console.log('Fetching detailed segment data for:', segment.segment.id);
            const segmentResponse = await axios.get(`${API_URL}/api/segment/${segment.segment.id}`, {
                params: {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_at: tokens.expires_at
                }
            });

            // Update the segment with detailed data
            segment.segment = {
                ...segment.segment,
                ...segmentResponse.data
            };
            console.log('Updated segment with detailed data:', segment.segment);
        }

        // Check if we have the necessary data
        if (!segment.segment.start_latlng || !segment.segment.end_latlng) {
            console.warn('Segment missing start/end coordinates:', segment.segment);
            return null;
        }

        // Check for cached data
        const cacheKey = `terrain_${segment.segment.id}_v1`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            // Cache for 24 hours
            if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                console.log('Using cached terrain data for segment:', segment.segment.id);
                return data;
            }
        }

        // Make API request
        const response = await axios.post(`${API_URL}/api/terrain`, {
            start_lat: segment.segment.start_latlng[0],
            start_lon: segment.segment.start_latlng[1],
            end_lat: segment.segment.end_latlng[0],
            end_lon: segment.segment.end_latlng[1],
            polyline: segment.segment.map?.polyline,
            distance_threshold: 0.0001
        });

        // Cache the response
        localStorage.setItem(cacheKey, JSON.stringify({
            data: response.data,
            timestamp: Date.now()
        }));

        console.log('Terrain data response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error fetching terrain data:', error);
        return null;
    }
};

// Function to calculate natural surface percentage
const calculateNaturalSurfacePercentage = (surfaces) => {
    if (!surfaces || surfaces.length === 0) return 0;
    
    const naturalSurfaces = ['gravel', 'wood', 'unpaved', 'dirt', 'ground', 'grass', 'sand', 'earth'];
    const naturalCount = surfaces.filter(surface => 
        naturalSurfaces.some(natural => surface.toLowerCase().includes(natural))
    ).length;
    
    return Math.round((naturalCount / surfaces.length) * 100);
};

// Function to format terrain data for display
const formatTerrainInfo = (terrainData) => {
    if (!terrainData) return 'No terrain data available';

    const parts = [];
    
    if (terrainData.surfaces?.length > 0) {
        parts.push(`Surface: ${terrainData.surfaces.join(', ')}`);
    }
    if (terrainData.tracktypes?.length > 0) {
        parts.push(`Track Type: ${terrainData.tracktypes.join(', ')}`);
    }
    if (terrainData.highways?.length > 0) {
        parts.push(`Road Type: ${terrainData.highways.join(', ')}`);
    }
    if (terrainData.natural_percentage !== undefined) {
        parts.push(`Natural Surface: ${terrainData.natural_percentage}% of distance`);
    }

    return parts.join('<br>');
};

const ActivityMap = ({ activity, selectedSegmentId, onSegmentClick }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [segmentData, setSegmentData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!activity || !activity.map || !activity.map.polyline) {
            console.log('No activity or polyline data available:', activity);
            return;
        }

        // Get tokens from localStorage
        const tokens = {
            access_token: localStorage.getItem('strava_token'),
            refresh_token: localStorage.getItem('strava_refresh_token'),
            expires_at: localStorage.getItem('strava_token_expires_at')
        };

        // Decode the polyline
        const decodedPoints = decode(activity.map.polyline);

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
            opacity: 0.5
        }).addTo(mapInstanceRef.current);

        // Add segments if available
        if (activity.segments && activity.segments.length > 0) {
            console.log('Processing segments:', activity.segments.length);
            
            // Sort segments by their position in the activity
            const sortedSegments = [...activity.segments].sort((a, b) => {
                const startA = a.start_index || 0;
                const startB = b.start_index || 0;
                return startA - startB;
            });

            // Find the selected segment
            const selectedSegment = selectedSegmentId ? 
                sortedSegments.find(s => s.segment.id.toString() === selectedSegmentId) : 
                null;

            // Process all segments but only fetch terrain data for the selected one
            sortedSegments.forEach((segment, index) => {
                if (segment.start_index !== undefined && segment.end_index !== undefined) {
                    const segmentPoints = decodedPoints.slice(segment.start_index, segment.end_index + 1);
                    const isSelected = selectedSegmentId === segment.segment.id.toString();
                    const segmentColor = isSelected ? '#ff0000' : getSegmentColor(segment.segment.id);
                    
                    // Create the polyline
                    const polyline = L.polyline(segmentPoints, {
                        color: segmentColor,
                        weight: isSelected ? 7 : 5,
                        opacity: isSelected ? 0.9 : 0.7
                    }).addTo(mapInstanceRef.current);

                    // Add click handler
                    polyline.on('click', () => {
                        onSegmentClick(segment.segment.id);
                    });

                    // Only fetch terrain data for the selected segment
                    if (isSelected) {
                        setLoading(true);
                        getTerrainData(segment, tokens).then(terrainData => {
                            const terrainInfo = formatTerrainInfo(terrainData);
                            polyline.bindPopup(`
                                <b>${segment.name}</b><br>
                                ${segment.segment.name}<br>
                                Length: ${(segment.segment.distance / 1000).toFixed(2)} km<br>
                                Position: ${index + 1} of ${sortedSegments.length}<br>
                                <br>
                                <b>Terrain Information:</b><br>
                                ${terrainInfo}
                            `);

                            setSegmentData({
                                name: segment.name,
                                length: (segment.segment.distance / 1000).toFixed(2),
                                position: index + 1,
                                surfaces: terrainData?.surfaces?.join(', ') || 'N/A',
                                tracktypes: terrainData?.tracktypes?.join(', ') || 'N/A',
                                highways: terrainData?.highways?.join(', ') || 'N/A',
                                natural_percentage: terrainData?.natural_percentage
                            });
                            setLoading(false);
                        }).catch(error => {
                            console.error('Error processing terrain data:', error);
                            setLoading(false);
                        });
                    }
                }
            });

            // If we have a selected segment, fit the map to it
            if (selectedSegment) {
                const selectedPoints = decodedPoints.slice(
                    selectedSegment.start_index,
                    selectedSegment.end_index + 1
                );
                const selectedPolyline = L.polyline(selectedPoints);
                mapInstanceRef.current.fitBounds(selectedPolyline.getBounds());
            } else {
                // Otherwise fit to the main route
                mapInstanceRef.current.fitBounds(mainRoute.getBounds());
            }
        }
    }, [activity, selectedSegmentId, onSegmentClick]);

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
                    borderRadius: '4px'
                }}
            />
            
            {loading ? (
                <Box display="flex" justifyContent="center" my={2}>
                    <CircularProgress />
                </Box>
            ) : segmentData ? (
                <>
                    <Typography variant="h6" gutterBottom>
                        Selected Segment Details
                    </Typography>
                    
                    <TableContainer component={Paper}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>#</TableCell>
                                    <TableCell>Name</TableCell>
                                    <TableCell align="right">Length (km)</TableCell>
                                    <TableCell align="right">Natural Surface %</TableCell>
                                    <TableCell>Surface Type</TableCell>
                                    <TableCell>Track Type</TableCell>
                                    <TableCell>Road Type</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                <TableRow>
                                    <TableCell>{segmentData.position}</TableCell>
                                    <TableCell component="th" scope="row">
                                        {segmentData.name}
                                    </TableCell>
                                    <TableCell align="right">{segmentData.length}</TableCell>
                                    <TableCell align="right">
                                        {segmentData.natural_percentage !== undefined ? 
                                            `${segmentData.natural_percentage}%` : 
                                            'N/A'}
                                    </TableCell>
                                    <TableCell>{segmentData.surfaces}</TableCell>
                                    <TableCell>{segmentData.tracktypes}</TableCell>
                                    <TableCell>{segmentData.highways}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            ) : (
                <Typography variant="body1" align="center" my={2}>
                    Click on a segment to view its details
                </Typography>
            )}
        </Box>
    );
};

export default ActivityMap; 