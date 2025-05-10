import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app

client = TestClient(app)

# Test data
MOCK_TERRAIN_RESPONSE = {
    'surfaces': ['gravel', 'asphalt'],
    'tracktypes': ['path'],
    'highways': ['residential'],
    'surface_distances': {'gravel': 0.5, 'asphalt': 0.5},
    'natural_percentage': 50
}

MOCK_SEGMENT_RESPONSE = {
    'id': 456,
    'name': 'Test Segment',
    'distance': 1000,
    'average_grade': 5.0,
    'map': {
        'polyline': 'test_polyline'
    }
}

@pytest.fixture
def mock_strava_client():
    with patch('main.strava_client') as mock:
        yield mock

@pytest.fixture
def mock_terrain_info():
    with patch('main.get_terrain_info') as mock:
        mock.return_value = MOCK_TERRAIN_RESPONSE
        yield mock

def test_health_check():
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_strava_auth_url():
    """Test the Strava auth URL endpoint."""
    response = client.get("/strava/auth-url")
    assert response.status_code == 200
    assert "url" in response.json()
    assert "strava.com" in response.json()["url"]

@pytest.mark.asyncio
async def test_strava_token_exchange():
    """Test the Strava token exchange endpoint."""
    with patch('main.get_strava_token') as mock_get_token:
        mock_get_token.return_value = {
            'access_token': 'test_token',
            'refresh_token': 'test_refresh',
            'expires_at': 1234567890
        }
        
        response = client.post("/strava/token", json={"code": "test_code"})
        assert response.status_code == 200
        assert "access_token" in response.json()
        assert "refresh_token" in response.json()
        assert "expires_at" in response.json()

@pytest.mark.asyncio
async def test_strava_token_refresh():
    """Test the Strava token refresh endpoint."""
    with patch('main.refresh_strava_token') as mock_refresh:
        mock_refresh.return_value = {
            'access_token': 'new_token',
            'refresh_token': 'new_refresh',
            'expires_at': 1234567890
        }
        
        response = client.post("/strava/refresh", json={"refresh_token": "test_refresh"})
        assert response.status_code == 200
        assert "access_token" in response.json()
        assert "refresh_token" in response.json()
        assert "expires_at" in response.json()

@pytest.mark.asyncio
async def test_get_activity_details(mock_strava_client):
    """Test the get activity details endpoint."""
    mock_strava_client.get_activity.return_value = {
        'id': 123,
        'name': 'Test Activity',
        'map': {'polyline': 'test_polyline'}
    }
    
    response = client.get("/strava/activities/123", headers={"Authorization": "Bearer test_token"})
    assert response.status_code == 200
    assert response.json()['id'] == 123
    assert response.json()['name'] == 'Test Activity'

@pytest.mark.asyncio
async def test_get_segment_details(mock_strava_client):
    """Test the get segment details endpoint."""
    mock_strava_client.get_segment.return_value = MOCK_SEGMENT_RESPONSE
    
    response = client.get("/strava/segments/456", headers={"Authorization": "Bearer test_token"})
    assert response.status_code == 200
    assert response.json()['id'] == 456
    assert response.json()['name'] == 'Test Segment'

@pytest.mark.asyncio
async def test_get_terrain_info(mock_terrain_info):
    """Test the get terrain info endpoint."""
    response = client.post(
        "/terrain/info",
        json={
            "start_lat": 40.521494,
            "start_lon": -111.828997,
            "end_lat": 40.525852,
            "end_lon": -111.826333,
            "polyline": "test_polyline"
        }
    )
    assert response.status_code == 200
    assert response.json() == MOCK_TERRAIN_RESPONSE

def test_invalid_terrain_info_request():
    """Test invalid terrain info request."""
    response = client.post(
        "/terrain/info",
        json={
            "start_lat": "invalid",
            "start_lon": -111.828997,
            "end_lat": 40.525852,
            "end_lon": -111.826333
        }
    )
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_unauthorized_activity_request():
    """Test unauthorized activity request."""
    response = client.get("/strava/activities/123")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_unauthorized_segment_request():
    """Test unauthorized segment request."""
    response = client.get("/strava/segments/456")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_invalid_token_refresh():
    """Test invalid token refresh request."""
    with patch('main.refresh_strava_token') as mock_refresh:
        mock_refresh.side_effect = Exception('Invalid refresh token')
        
        response = client.post("/strava/refresh", json={"refresh_token": "invalid_token"})
        assert response.status_code == 400
        assert "error" in response.json()

@pytest.mark.asyncio
async def test_invalid_activity_id():
    """Test request with invalid activity ID."""
    response = client.get("/strava/activities/invalid", headers={"Authorization": "Bearer test_token"})
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_invalid_segment_id():
    """Test request with invalid segment ID."""
    response = client.get("/strava/segments/invalid", headers={"Authorization": "Bearer test_token"})
    assert response.status_code == 422 