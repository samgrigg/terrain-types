import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Paper,
  Alert,
  IconButton,
  Toolbar,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import axios from 'axios';
import ActivityMap from './components/ActivityMap';
import ActivityFeedCard from './components/ActivityFeedCard';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const SLIDE_MS = 280;

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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [riderLabel, setRiderLabel] = useState('You');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const touchStartX = useRef(null);

  const urlParams = new URLSearchParams(location.search);
  const activityId = urlParams.get('activity');
  const authError = urlParams.get('error');

  useEffect(() => {
    if (!activityId) {
      setSelectedActivity(null);
      setMobilePanelOpen(false);
    }
  }, [activityId]);

  const handleActivityClick = useCallback(async (activity, updateUrl = true) => {
    const stub = {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      distance: activity.distance,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      start_date: activity.start_date,
      map: activity.summary_polyline ? { polyline: activity.summary_polyline } : {},
      segments: [],
    };
    setSelectedActivity(stub);
    setDetailLoading(true);
    if (updateUrl) {
      navigate(`/?activity=${activity.id}`, { replace: false });
    }

    try {
      const access_token = localStorage.getItem('strava_token');
      const refresh_token = localStorage.getItem('strava_refresh_token');
      const expires_at = localStorage.getItem('strava_token_expires_at');

      const response = await axios.get(`${API_URL}/api/activities/${activity.id}`, {
        params: {
          access_token,
          refresh_token,
          expires_at,
        },
      });

      setSelectedActivity(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch activity details');
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (activityId && activities.length > 0) {
      const activity = activities.find((a) => a.id.toString() === activityId);
      if (activity) {
        handleActivityClick(activity, false);
      }
    }
  }, [activityId, activities, handleActivityClick]);

  useEffect(() => {
    if (selectedActivity && !isDesktop) {
      const id = requestAnimationFrame(() => setMobilePanelOpen(true));
      return () => cancelAnimationFrame(id);
    }
    if (!selectedActivity || isDesktop) {
      setMobilePanelOpen(false);
    }
    return undefined;
  }, [selectedActivity, isDesktop]);

  const clearActivityCache = useCallback(() => {
    localStorage.removeItem('strava_activities');
    localStorage.removeItem('strava_activities_last_fetch');
  }, []);

  const loadActivities = useCallback(async () => {
    try {
      setListLoading(true);

      const cachedActivities = localStorage.getItem('strava_activities');
      const lastFetchTime = localStorage.getItem('strava_activities_last_fetch');
      const now = Date.now();

      if (cachedActivities && lastFetchTime && (now - parseInt(lastFetchTime, 10)) < 5 * 60 * 1000) {
        setActivities(JSON.parse(cachedActivities));
        setError(null);
        return;
      }

      const access_token = localStorage.getItem('strava_token');
      const refresh_token = localStorage.getItem('strava_refresh_token');
      const expires_at = localStorage.getItem('strava_token_expires_at');

      const response = await axios.get(`${API_URL}/api/activities`, {
        params: {
          access_token,
          refresh_token,
          expires_at,
        },
      });

      localStorage.setItem('strava_activities', JSON.stringify(response.data));
      localStorage.setItem('strava_activities_last_fetch', now.toString());

      setActivities(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch activities');
      console.error(err);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authError) {
      setError('Authentication failed. Please try again.');
    }

    const token = localStorage.getItem('strava_token');
    if (token) {
      setIsAuthenticated(true);
      loadActivities();
    }
  }, [authError, loadActivities]);

  useEffect(() => {
    const loadAthlete = async () => {
      if (!isAuthenticated) {
        return;
      }
      try {
        const access_token = localStorage.getItem('strava_token');
        const refresh_token = localStorage.getItem('strava_refresh_token');
        const expires_at = localStorage.getItem('strava_token_expires_at');
        const response = await axios.get(`${API_URL}/api/athlete`, {
          params: { access_token, refresh_token, expires_at },
        });
        const a = response.data;
        const label = [a.firstname, a.lastname].filter(Boolean).join(' ').trim()
          || a.username
          || 'You';
        setRiderLabel(label);
      } catch {
        setRiderLabel('You');
      }
    };
    loadAthlete();
  }, [isAuthenticated]);

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
          expires_at,
        },
        responseType: 'blob',
      });

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

  const closeDetail = useCallback(() => {
    if (!isDesktop) {
      setMobilePanelOpen(false);
      window.setTimeout(() => {
        setSelectedActivity(null);
        navigate('/', { replace: true });
      }, SLIDE_MS);
    } else {
      setSelectedActivity(null);
      navigate('/', { replace: true });
    }
  }, [isDesktop, navigate]);

  const onDetailTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onDetailTouchEnd = useCallback((e) => {
    if (touchStartX.current == null) {
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx > 72) {
      closeDetail();
    }
  }, [closeDetail]);

  const detailPaper = selectedActivity && (
    <Paper
      elevation={isDesktop ? 2 : 0}
      sx={{
        p: isDesktop ? 2 : 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: isDesktop ? 520 : '100%',
        overflow: 'hidden',
      }}
    >
      {!isDesktop && (
        <Toolbar variant="dense" sx={{ gap: 1, borderBottom: 1, borderColor: 'divider' }}>
          <IconButton edge="start" onClick={closeDetail} aria-label="Back">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="subtitle1" noWrap sx={{ flex: 1 }}>
            {selectedActivity.name}
          </Typography>
        </Toolbar>
      )}
      {isDesktop && (
        <Typography variant="h6" gutterBottom sx={{ px: 0, pt: 0 }}>
          {selectedActivity.name}
        </Typography>
      )}
      <Box sx={{ position: 'relative', flex: 1, overflow: 'auto', px: isDesktop ? 0 : 1, pb: 1 }}>
        {detailLoading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : (
          <ActivityMap activity={selectedActivity} />
        )}
      </Box>
    </Paper>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', px: { xs: 1.5, sm: 2 }, py: 2 }}>
        <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
          Terrain Types
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!isAuthenticated ? (
          <Button variant="contained" color="primary" onClick={handleStravaAuth} sx={{ mt: 2 }}>
            Connect with Strava
          </Button>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" color="primary" size="small" onClick={handleDownload}>
                Download JSON
              </Button>
              <Button variant="outlined" color="primary" size="small" onClick={handleRefresh}>
                Refresh
              </Button>
            </Box>

            <Box
              sx={{
                display: 'flex',
                flexDirection: isDesktop ? 'row' : 'column',
                flex: 1,
                gap: 2,
                minHeight: 0,
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  width: isDesktop ? 400 : '100%',
                  maxWidth: isDesktop ? 440 : '100%',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Activities
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    flex: 1,
                    overflow: 'auto',
                    maxHeight: isDesktop ? 'calc(100vh - 220px)' : 'none',
                  }}
                >
                  {listLoading ? (
                    <Box display="flex" justifyContent="center" py={4}>
                      <CircularProgress size={28} />
                    </Box>
                  ) : (
                    activities.map((activity) => (
                      <ActivityFeedCard
                        key={activity.id}
                        activity={activity}
                        riderName={riderLabel}
                        selected={selectedActivity?.id === activity.id}
                        onSelect={(a) => handleActivityClick(a, true)}
                      />
                    ))
                  )}
                </Paper>
              </Box>

              {isDesktop && (
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  {selectedActivity ? (
                    detailPaper
                  ) : (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', flex: 1 }}>
                      <Typography color="text.secondary">
                        Select an activity for route & terrain detail
                      </Typography>
                    </Paper>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {!isDesktop && selectedActivity && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: theme.zIndex.modal,
            bgcolor: 'background.paper',
            transform: mobilePanelOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: theme.transitions.create('transform', {
              duration: SLIDE_MS,
              easing: theme.transitions.easing.easeOut,
            }),
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onTouchStart={onDetailTouchStart}
          onTouchEnd={onDetailTouchEnd}
        >
          {detailPaper}
        </Box>
      )}
    </Box>
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
