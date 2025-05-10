import pytest
from unittest.mock import patch, MagicMock
from main import get_terrain_info, TerrainQuery
import math
import asyncio

# Test data
MOCK_SEGMENT = {
    'start_lat': 40.521494,
    'start_lon': -111.828997,
    'end_lat': 40.525852,
    'end_lon': -111.826333,
    'polyline': 'test_polyline'
}

MOCK_OVERPASS_RESPONSE = {
    'elements': [
        {
            'type': 'way',
            'id': 1,
            'nodes': [1, 2, 3],
            'tags': {
                'surface': 'gravel',
                'tracktype': 'grade1',
                'highway': 'path'
            }
        },
        {
            'type': 'way',
            'id': 2,
            'nodes': [4, 5, 6],
            'tags': {
                'surface': 'asphalt',
                'highway': 'residential'
            }
        }
    ]
}

@pytest.fixture
def terrain_query():
    return TerrainQuery(
        start_lat=MOCK_SEGMENT['start_lat'],
        start_lon=MOCK_SEGMENT['start_lon'],
        end_lat=MOCK_SEGMENT['end_lat'],
        end_lon=MOCK_SEGMENT['end_lon'],
        distance_threshold=0.0001
    )

@pytest.mark.asyncio
async def test_get_terrain_info_basic(terrain_query):
    """Test basic terrain info retrieval with mock data."""
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = MOCK_OVERPASS_RESPONSE
        
        result = await get_terrain_info(terrain_query)
        
        assert isinstance(result, dict)
        assert 'surfaces' in result
        assert 'tracktypes' in result
        assert 'highways' in result
        assert 'surface_distances' in result
        assert 'natural_percentage' in result

@pytest.mark.asyncio
async def test_get_terrain_info_empty_response(terrain_query):
    """Test handling of empty Overpass response."""
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = {'elements': []}
        
        result = await get_terrain_info(terrain_query)
        
        assert result['surfaces'] == []
        assert result['tracktypes'] == []
        assert result['highways'] == []
        assert result['natural_percentage'] == 0

@pytest.mark.asyncio
async def test_get_terrain_info_error_handling(terrain_query):
    """Test error handling in terrain info retrieval."""
    with patch('main.query_overpass') as mock_query:
        mock_query.side_effect = Exception('API Error')
        
        result = await get_terrain_info(terrain_query)
        
        assert result['surfaces'] == []
        assert result['tracktypes'] == []
        assert result['highways'] == []
        assert result['natural_percentage'] == 0

def test_distance_calculation():
    """Test distance calculation between two points."""
    # Test points (roughly 1km apart)
    lat1, lon1 = 40.521494, -111.828997
    lat2, lon2 = 40.525852, -111.826333
    
    # Calculate distance using Haversine formula
    R = 6371000  # Earth's radius in meters
    lat1, lon1 = math.radians(lat1), math.radians(lon1)
    lat2, lon2 = math.radians(lat2), math.radians(lon2)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    distance = R * c
    
    # Distance should be roughly 1km
    assert 900 < distance < 1100, f"Expected distance around 1km, got {distance}m"

@pytest.mark.asyncio
async def test_way_overlap_detection(terrain_query):
    """Test detection of overlap between a way and a segment."""
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = MOCK_OVERPASS_RESPONSE
        
        result = await get_terrain_info(terrain_query)
        
        # Check if ways were properly processed
        assert len(result['surfaces']) > 0
        assert len(result['highways']) > 0

@pytest.mark.asyncio
async def test_surface_type_classification(terrain_query):
    """Test classification of surface types."""
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = MOCK_OVERPASS_RESPONSE
        
        result = await get_terrain_info(terrain_query)
        
        # Check if surfaces were properly classified
        assert 'gravel' in result['surfaces']
        assert 'asphalt' in result['surfaces']
        assert result['natural_percentage'] > 0

@pytest.mark.asyncio
async def test_distance_threshold(terrain_query):
    """Test distance threshold filtering."""
    # Test with a very small threshold
    terrain_query.distance_threshold = 0.00001
    
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = MOCK_OVERPASS_RESPONSE
        
        result = await get_terrain_info(terrain_query)
        
        # With a very small threshold, we should get fewer matches
        assert len(result['surfaces']) <= len(MOCK_OVERPASS_RESPONSE['elements'])

@pytest.mark.asyncio
async def test_polyline_processing(terrain_query):
    """Test processing of polyline data."""
    terrain_query.polyline = 'test_polyline'
    
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = MOCK_OVERPASS_RESPONSE
        
        result = await get_terrain_info(terrain_query)
        
        # Check if the result contains the expected data
        assert isinstance(result, dict)
        assert 'surface_distances' in result

@pytest.mark.asyncio
async def test_error_handling_invalid_coordinates(terrain_query):
    """Test handling of invalid coordinates."""
    terrain_query.start_lat = 1000  # Invalid latitude
    
    with patch('main.query_overpass') as mock_query:
        mock_query.return_value = MOCK_OVERPASS_RESPONSE
        
        result = await get_terrain_info(terrain_query)
        
        # Should handle invalid coordinates gracefully
        assert isinstance(result, dict)
        assert result['surfaces'] == []
        assert result['tracktypes'] == []
        assert result['highways'] == []
        assert result['natural_percentage'] == 0

if __name__ == '__main__':
    pytest.main([__file__]) 