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
import { getTerrainData, formatTerrainInfo } from '../utils/terrainUtils';
import {
    initializeMap,
    clearMapLayers,
    createMainRoutePolyline,
    createSegmentPolyline,
    createSegmentPopup,
    fitMapToSegment,
    processActivityData,
    sortSegmentsByPosition
} from '../utils/mapUtils';

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

// Function to calculate natural surface percentage
const calculateNaturalSurfacePercentage = (surfaces) => {
    if (!surfaces || surfaces.length === 0) return 0;
    
    const naturalSurfaces = ['gravel', 'wood', 'unpaved', 'dirt', 'ground', 'grass', 'sand', 'earth'];
    const naturalCount = surfaces.filter(surface => 
        naturalSurfaces.some(natural => surface.toLowerCase().includes(natural))
    ).length;
    
    return Math.round((naturalCount / surfaces.length) * 100);
};

const ActivityMap = ({ activity, selectedSegmentId, onSegmentClick }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [segmentData, setSegmentData] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSegmentSelection = async (segment, index, totalSegments) => {
        setLoading(true);
        try {
            const tokens = {
                access_token: localStorage.getItem('strava_token'),
                refresh_token: localStorage.getItem('strava_refresh_token'),
                expires_at: localStorage.getItem('strava_token_expires_at')
            };

            const terrainData = await getTerrainData(segment, tokens);
            const terrainInfo = formatTerrainInfo(terrainData);

            setSegmentData({
                name: segment.name,
                length: (segment.segment.distance / 1000).toFixed(2),
                position: index + 1,
                surfaces: terrainData?.surfaces?.join(', ') || 'N/A',
                tracktypes: terrainData?.tracktypes?.join(', ') || 'N/A',
                highways: terrainData?.highways?.join(', ') || 'N/A',
                natural_percentage: terrainData?.natural_percentage
            });

            return terrainInfo;
        } catch (error) {
            console.error('Error processing terrain data:', error);
            return 'Error loading terrain data';
        } finally {
            setLoading(false);
        }
    };

    const renderSegmentDetails = () => {
        if (loading) {
            return (
                <Box display="flex" justifyContent="center" my={2}>
                    <CircularProgress />
                </Box>
            );
        }

        if (!segmentData) {
            return (
                <Typography variant="body1" align="center" my={2}>
                    Click on a segment to view its details
                </Typography>
            );
        }

        return (
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
        );
    };

    useEffect(() => {
        const decodedPoints = processActivityData(activity);
        if (!decodedPoints) return;

        // Initialize map if needed
        if (!mapInstanceRef.current) {
            mapInstanceRef.current = initializeMap(mapRef.current);
        }

        // Clear existing layers
        clearMapLayers(mapInstanceRef.current);

        // Create main route
        const mainRoute = createMainRoutePolyline(mapInstanceRef.current, decodedPoints);

        // Process segments
        if (activity.segments?.length > 0) {
            const sortedSegments = sortSegmentsByPosition(activity.segments);
            const selectedSegment = selectedSegmentId ? 
                sortedSegments.find(s => s.segment.id.toString() === selectedSegmentId) : 
                null;

            sortedSegments.forEach(async (segment, index) => {
                if (segment.start_index !== undefined && segment.end_index !== undefined) {
                    const segmentPoints = decodedPoints.slice(
                        segment.start_index,
                        segment.end_index + 1
                    );
                    const isSelected = selectedSegmentId === segment.segment.id.toString();
                    
                    const polyline = createSegmentPolyline(
                        mapInstanceRef.current,
                        segmentPoints,
                        segment,
                        isSelected
                    );

                    polyline.on('click', () => onSegmentClick(segment.segment.id));

                    if (isSelected) {
                        const terrainInfo = await handleSegmentSelection(
                            segment,
                            index,
                            sortedSegments.length
                        );
                        polyline.bindPopup(createSegmentPopup(
                            segment,
                            index,
                            sortedSegments.length,
                            terrainInfo
                        ));
                    }
                }
            });

            // Fit map to selected segment or main route
            if (selectedSegment) {
                const selectedPoints = decodedPoints.slice(
                    selectedSegment.start_index,
                    selectedSegment.end_index + 1
                );
                fitMapToSegment(mapInstanceRef.current, selectedPoints);
            } else {
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
            {renderSegmentDetails()}
        </Box>
    );
};

export default ActivityMap; 