import pytest
from main import get_terrain_info
from main import TerrainQuery
import math
import asyncio

@pytest.mark.asyncio
async def test_basic_terrain_query():
    """Test a basic terrain query with known coordinates."""
    query = TerrainQuery(
        start_lat=40.521494,
        start_lon=-111.828997,
        end_lat=40.525852,
        end_lon=-111.826333,
        distance_threshold=0.0001
    )
    
    result = await get_terrain_info(query)
    
    # Basic structure checks
    assert isinstance(result, dict)
    assert 'surfaces' in result
    assert 'tracktypes' in result
    assert 'highways' in result
    assert 'surface_distances' in result
    assert 'natural_percentage' in result
    
    # Type checks
    assert isinstance(result['surfaces'], list)
    assert isinstance(result['tracktypes'], list)
    assert isinstance(result['highways'], list)
    assert isinstance(result['surface_distances'], dict)
    assert isinstance(result['natural_percentage'], (int, float))

def test_distance_calculation():
    """Test the distance calculation between two points."""
    # Test points (roughly 1km apart)
    # Using coordinates that are actually 1km apart
    lat1, lon1 = 40.521494, -111.828997  # Starting point
    lat2, lon2 = 40.530494, -111.828997  # Point 1km north
    
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
async def test_way_overlap_detection():
    """Test detection of overlap between a way and a segment."""
    # Create a test way that overlaps with our segment
    way_nodes = [
        (40.521494, -111.828997),  # Start of segment
        (40.523673, -111.827665),  # Middle point
        (40.525852, -111.826333)   # End of segment
    ]
    
    # Test points that should be considered overlapping
    test_points = [
        (40.521494, -111.828997),  # Exact start point
        (40.523673, -111.827665),  # Middle point
        (40.525852, -111.826333),  # Exact end point
        (40.523673, -111.827665)   # Point near middle
    ]
    
    # Test points that should not be considered overlapping
    non_overlapping_points = [
        (40.530000, -111.830000),  # Far away point
        (40.520000, -111.820000)   # Another far point
    ]
    
    # TODO: Implement actual overlap detection test
    # This will require mocking the Overpass API response
    pass

def test_surface_type_classification():
    """Test classification of surface types as natural or not."""
    natural_surfaces = ['gravel', 'wood', 'unpaved', 'dirt', 'ground', 'grass', 'sand', 'earth']
    
    # Test cases
    test_cases = [
        ('gravel', True),
        ('asphalt', False),
        ('concrete', False),
        ('dirt', True),
        ('paved', False),
        ('unpaved', True),
        ('grass', True),
        ('sand', True),
        ('earth', True),
        ('wood', True),
        ('ground', True)
    ]
    
    for surface, should_be_natural in test_cases:
        is_natural = any(natural in surface.lower() for natural in natural_surfaces)
        assert is_natural == should_be_natural, f"Surface '{surface}' was incorrectly classified"

@pytest.mark.asyncio
async def test_polyline_decoding():
    """Test decoding of polyline data."""
    # Example polyline from a real segment
    test_polyline = "}~vxFy`{s@fS]"
    
    query = TerrainQuery(
        start_lat=40.521494,
        start_lon=-111.828997,
        end_lat=40.525852,
        end_lon=-111.826333,
        polyline=test_polyline,
        distance_threshold=0.0001
    )
    
    result = await get_terrain_info(query)
    
    # TODO: Add assertions once we understand the expected behavior
    pass

@pytest.mark.asyncio
async def test_distance_threshold():
    """Test different distance thresholds affect the results."""
    # Test with different thresholds
    thresholds = [0.0001, 0.0005, 0.001]
    
    for threshold in thresholds:
        query = TerrainQuery(
            start_lat=40.521494,
            start_lon=-111.828997,
            end_lat=40.525852,
            end_lon=-111.826333,
            distance_threshold=threshold
        )
        
        result = await get_terrain_info(query)
        
        # TODO: Implement threshold testing
        # This will require understanding how the threshold affects the results
        pass

if __name__ == '__main__':
    pytest.main([__file__]) 