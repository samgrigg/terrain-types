import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Paper,
  Alert,
  Grid,
} from '@mui/material';
import axios from 'axios';
import { decode } from '@mapbox/polyline';
import ActivityMap from './components/ActivityMap';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * TODO
 * - Surfaces aren't making sense yet - known mtb trails are coming back as asphalt. Need to breatk out the Overpass queries to manually inspect.
 * - For the purposes of this app, we want to work with the longest segments only. Shorter, overlapping segments should be ignored.
 * - Need to break things out into functions - I have no idea what's going on in this code.
 */




function AuthSuccess() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const access_token = urlParams.get('access_token');
    const refresh_token = urlParams.get('refresh_token');
    const expires_at = urlParams.get('expires_at');

    if (access_token && refresh_token && expires_at) {
      localStorage.setItem('strava_token', access_token);
      localStorage.setItem('strava_refresh_token', refresh_token);
      localStorage.setItem('strava_token_expires_at', expires_at);
      navigate('/');
    } else {
      navigate('/?error=auth_failed');
    }
  }, [navigate, location]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
    >
      <CircularProgress />
      <Typography variant="h6" sx={{ mt: 2 }}>
        Completing authentication...
      </Typography>
    </Box>
  );
}

function AuthError() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const error = urlParams.get('error');
    navigate(`/?error=${error}`);
  }, [navigate, location]);

  return null;
}

function MainApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Get activity ID from URL if present
  const urlParams = new URLSearchParams(location.search);
  const activityId = urlParams.get('activity');
  const authError = urlParams.get('error');

  const handleActivityClick = useCallback(async (activity, updateUrl = false) => {
    try {
      setLoading(true);
      const access_token = localStorage.getItem('strava_token');
      const refresh_token = localStorage.getItem('strava_refresh_token');
      const expires_at = localStorage.getItem('strava_token_expires_at');

      const response = await axios.get(`${API_URL}/api/activities/${activity.id}`, {
        params: {
          access_token,
          refresh_token,
          expires_at
        }
      });
      
      console.log("Response", response.data);
      const polyline = response.data.map?.polyline;
      console.log("Polyline", polyline);
      if (polyline) {
        const decodedPolyline = decode(polyline);
        console.log("Decoded Polyline", decodedPolyline);
      }
      setSelectedActivity(response.data);
      
      // Only update URL if explicitly requested, using React Router's navigate
      if (updateUrl) {
        navigate(`/?activity=${activity.id}`, { replace: true });
      }
    } catch (err) {
      setError('Failed to fetch activity details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Load activity details when URL changes
  useEffect(() => {
    if (activityId && activities.length > 0) {
      const activity = activities.find(a => a.id.toString() === activityId);
      if (activity) {
        handleActivityClick(activity, false); // false means don't update URL
      }
    }
  }, [activityId, activities, handleActivityClick]);

  const clearActivityCache = useCallback(() => {
    localStorage.removeItem('strava_activities');
    localStorage.removeItem('strava_activities_last_fetch');
  }, []);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check if we have cached activities
      const cachedActivities = localStorage.getItem('strava_activities');
      const lastFetchTime = localStorage.getItem('strava_activities_last_fetch');
      const now = Date.now();
      
      // If we have cached activities and they're less than 5 minutes old, use them
      if (cachedActivities && lastFetchTime && (now - parseInt(lastFetchTime)) < 5 * 60 * 1000) {
        console.log('Using cached activities');
        setActivities(JSON.parse(cachedActivities));
        setError(null);
        return;
      }

      // Otherwise, fetch new activities
      console.log('Fetching new activities from Strava');
      const access_token = localStorage.getItem('strava_token');
      const refresh_token = localStorage.getItem('strava_refresh_token');
      const expires_at = localStorage.getItem('strava_token_expires_at');

      const response = await axios.get(`${API_URL}/api/activities`, {
        params: {
          access_token,
          refresh_token,
          expires_at
        }
      });
      
      // Cache the new activities
      localStorage.setItem('strava_activities', JSON.stringify(response.data));
      localStorage.setItem('strava_activities_last_fetch', now.toString());
      
      setActivities(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch activities');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for authentication error in URL
    if (authError) {
      setError('Authentication failed. Please try again.');
    }

    // Check if we have a token in localStorage
    const token = localStorage.getItem('strava_token');
    if (token) {
      setIsAuthenticated(true);
      loadActivities();
    }
  }, [authError, loadActivities]);

  const handleStravaAuth = useCallback(() => {
    const clientId = process.env.REACT_APP_STRAVA_CLIENT_ID;
    const redirectUri = `${API_URL}/api/auth/callback`;
    const scope = 'read,activity:read';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=${scope}`;
    window.location.href = authUrl;
  }, []);

  const handleRefresh = useCallback(() => {
    clearActivityCache();
    loadActivities();
  }, [clearActivityCache, loadActivities]);

  const handleDownload = useCallback(async () => {
    try {
      const access_token = localStorage.getItem('strava_token');
      const refresh_token = localStorage.getItem('strava_refresh_token');
      const expires_at = localStorage.getItem('strava_token_expires_at');

      const response = await axios.get(`${API_URL}/api/activities/download`, {
        params: {
          access_token,
          refresh_token,
          expires_at
        },
        responseType: 'blob'
      });

      // Create a download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'strava_activities.json');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download activities');
      console.error(err);
    }
  }, []);


  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Strava Activity Downloader
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!isAuthenticated ? (
          <Button
            variant="contained"
            color="primary"
            onClick={handleStravaAuth}
            sx={{ mt: 2 }}
          >
            Connect with Strava
          </Button>
        ) : (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleDownload}
              >
                Download Activities
              </Button>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleRefresh}
              >
                Refresh Activities
              </Button>
            </Box>

            {loading ? (
              <CircularProgress />
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Paper elevation={3} sx={{ p: 2, maxHeight: '800px', overflow: 'auto' }}>
                    <Typography variant="h6" gutterBottom>
                      Your Activities
                    </Typography>
                    <List>
                      {activities.map((activity) => (
                        <ListItem
                          key={activity.id}
                          button
                          selected={selectedActivity?.id === activity.id}
                          onClick={() => handleActivityClick(activity)}
                          sx={{ 
                            '&.Mui-selected': {
                              backgroundColor: 'rgba(25, 118, 210, 0.08)',
                              '&:hover': {
                                backgroundColor: 'rgba(25, 118, 210, 0.12)',
                              },
                            },
                          }}
                        >
                          <ListItemText
                            primary={activity.name}
                            secondary={`${activity.type} - ${new Date(activity.start_date).toLocaleDateString()}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Paper elevation={3} sx={{ p: 2 }}>
                    {selectedActivity ? (
                      <>
                        <Typography variant="h6" gutterBottom>
                          {selectedActivity.name}
                        </Typography>
                        <ActivityMap activity={selectedActivity} />
                      </>
                    ) : (
                      <Box sx={{ p: 2, textAlign: 'center' }}>
                        Select an activity to view its route
                      </Box>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            )}
          </Box>
        )}
      </Box>
    </Container>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/auth/success" element={<AuthSuccess />} />
        <Route path="/auth/error" element={<AuthError />} />
        <Route path="/" element={<MainApp />} />
      </Routes>
    </Router>
  );
}

export default App; 
