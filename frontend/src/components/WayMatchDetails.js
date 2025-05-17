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
    Box,
    Chip
} from '@mui/material';

const WayMatchDetails = ({ matches }) => {
    if (!matches || matches.length === 0) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography variant="body1" color="text.secondary">
                    No matching OSM ways found
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
                Matching OSM Ways
            </Typography>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>OSM ID</TableCell>
                            <TableCell>Highway Type</TableCell>
                            <TableCell>Match Type</TableCell>
                            <TableCell>Distance</TableCell>
                            <TableCell>Confidence</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {matches.map((match) => (
                            <TableRow key={match.way.id}>
                                <TableCell>
                                    <a
                                        href={`https://www.openstreetmap.org/way/${match.way.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {match.way.id}
                                    </a>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={match.way.tags.highway || 'unknown'}
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={match.match_type}
                                        size="small"
                                        color={match.match_type === 'forward' ? 'success' : 'warning'}
                                    />
                                </TableCell>
                                <TableCell>
                                    {match.distance.toFixed(1)}m
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Box
                                            sx={{
                                                width: '100%',
                                                height: 8,
                                                bgcolor: 'grey.200',
                                                borderRadius: 1,
                                                mr: 1
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: `${match.confidence * 100}%`,
                                                    height: '100%',
                                                    bgcolor: match.confidence > 0.8 ? 'success.main' :
                                                            match.confidence > 0.6 ? 'warning.main' :
                                                            'error.main',
                                                    borderRadius: 1
                                                }}
                                            />
                                        </Box>
                                        {(match.confidence * 100).toFixed(0)}%
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default WayMatchDetails; 