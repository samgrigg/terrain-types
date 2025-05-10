import pytest
from unittest.mock import patch, MagicMock
from main import (
    get_strava_token,
    refresh_strava_token,
    get_activity_details,
    get_segment_details,
    get_activity_segments
)

# Test data
MOCK_ACTIVITY = {
    'id': 123,
    'name': 'Test Activity',
    'map': {
        'polyline': 'test_polyline'
    },
    'segment_efforts': [
        {
            'segment': {
                'id': 456,
                'name': 'Test Segment'
            },
            'start_index': 0,
            'end_index': 100
        }
    ]
}

MOCK_SEGMENT = {
    'id': 456,
    'name': 'Test Segment',
    'distance': 1000,
    'average_grade': 5.0,
    'map': {
        'polyline': 'test_polyline'
    }
}

MOCK_TOKEN_RESPONSE = {
    'access_token': 'new_access_token',
    'refresh_token': 'new_refresh_token',
    'expires_at': 1234567890
}

@pytest.fixture
def mock_strava_client():
    with patch('main.strava_client') as mock:
        yield mock

@pytest.mark.asyncio
async def test_get_strava_token():
    """Test getting Strava token."""
    with patch('main.strava_client.exchange_code_for_token') as mock_exchange:
        mock_exchange.return_value = MOCK_TOKEN_RESPONSE
        
        result = await get_strava_token('test_code')
        
        assert result == MOCK_TOKEN_RESPONSE
        mock_exchange.assert_called_once_with('test_code')

@pytest.mark.asyncio
async def test_refresh_strava_token():
    """Test refreshing Strava token."""
    with patch('main.strava_client.refresh_access_token') as mock_refresh:
        mock_refresh.return_value = MOCK_TOKEN_RESPONSE
        
        result = await refresh_strava_token('test_refresh_token')
        
        assert result == MOCK_TOKEN_RESPONSE
        mock_refresh.assert_called_once_with('test_refresh_token')

@pytest.mark.asyncio
async def test_get_activity_details(mock_strava_client):
    """Test getting activity details."""
    mock_strava_client.get_activity.return_value = MOCK_ACTIVITY
    
    result = await get_activity_details(123, 'test_token')
    
    assert result == MOCK_ACTIVITY
    mock_strava_client.get_activity.assert_called_once_with(123, 'test_token')

@pytest.mark.asyncio
async def test_get_segment_details(mock_strava_client):
    """Test getting segment details."""
    mock_strava_client.get_segment.return_value = MOCK_SEGMENT
    
    result = await get_segment_details(456, 'test_token')
    
    assert result == MOCK_SEGMENT
    mock_strava_client.get_segment.assert_called_once_with(456, 'test_token')

@pytest.mark.asyncio
async def test_get_activity_segments(mock_strava_client):
    """Test getting activity segments."""
    mock_strava_client.get_activity.return_value = MOCK_ACTIVITY
    
    result = await get_activity_segments(123, 'test_token')
    
    assert len(result) == 1
    assert result[0]['segment']['id'] == 456
    assert result[0]['start_index'] == 0
    assert result[0]['end_index'] == 100

@pytest.mark.asyncio
async def test_get_activity_details_error(mock_strava_client):
    """Test error handling in get_activity_details."""
    mock_strava_client.get_activity.side_effect = Exception('API Error')
    
    with pytest.raises(Exception) as exc_info:
        await get_activity_details(123, 'test_token')
    
    assert str(exc_info.value) == 'API Error'

@pytest.mark.asyncio
async def test_get_segment_details_error(mock_strava_client):
    """Test error handling in get_segment_details."""
    mock_strava_client.get_segment.side_effect = Exception('API Error')
    
    with pytest.raises(Exception) as exc_info:
        await get_segment_details(456, 'test_token')
    
    assert str(exc_info.value) == 'API Error'

@pytest.mark.asyncio
async def test_get_activity_segments_no_segments(mock_strava_client):
    """Test getting activity segments when there are none."""
    activity_without_segments = MOCK_ACTIVITY.copy()
    activity_without_segments['segment_efforts'] = []
    mock_strava_client.get_activity.return_value = activity_without_segments
    
    result = await get_activity_segments(123, 'test_token')
    
    assert len(result) == 0

@pytest.mark.asyncio
async def test_token_refresh_flow():
    """Test the complete token refresh flow."""
    with patch('main.strava_client.refresh_access_token') as mock_refresh:
        mock_refresh.return_value = MOCK_TOKEN_RESPONSE
        
        # Test initial token refresh
        result = await refresh_strava_token('test_refresh_token')
        assert result == MOCK_TOKEN_RESPONSE
        
        # Test that the new token is used for subsequent requests
        with patch('main.strava_client.get_activity') as mock_get_activity:
            mock_get_activity.return_value = MOCK_ACTIVITY
            await get_activity_details(123, result['access_token'])
            mock_get_activity.assert_called_once_with(123, 'new_access_token') 