import React, { useState, useEffect } from 'react';
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
import ActivityMap from './components/ActivityMap';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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

  useEffect(() => {
    // Check for authentication error in URL
    const urlParams = new URLSearchParams(location.search);
    const authError = urlParams.get('error');
    if (authError) {
      setError('Authentication failed. Please try again.');
    }

    // Check if we have a token in localStorage
    const token = localStorage.getItem('strava_token');
    if (token) {
      setIsAuthenticated(true);
      fetchActivities();
    }
  }, [location]);

  const handleStravaAuth = () => {
    const clientId = process.env.REACT_APP_STRAVA_CLIENT_ID;
    const redirectUri = `${API_URL}/api/auth/callback`;
    const scope = 'read,activity:read';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=${scope}`;
    window.location.href = authUrl;
  };

  const fetchActivities = async () => {
    try {
      setLoading(true);
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
      setActivities(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch activities');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
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
  };

  const handleActivityClick = (activity) => {
    setSelectedActivity(activity);
  };

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
            <Button
              variant="contained"
              color="primary"
              onClick={handleDownload}
              sx={{ mt: 2, mb: 4 }}
            >
              Download Activities
            </Button>

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