from typing import List, Tuple, Optional
import math
import polyline
from ..models.osm import OSMWay, OSMNode, WayMatchResult
from ..utils.overpass_client import OverpassClient

class WayMatchingService:
    """Service for matching Strava segments to OSM ways."""

    def __init__(self, overpass_client: OverpassClient):
        """Initialize the service with an Overpass API client."""
        self.overpass_client = overpass_client

    async def find_matching_ways(
        self,
        segment_polyline: str,
        max_distance: float = 10.0,  # meters
        min_confidence: float = 0.7
    ) -> List[WayMatchResult]:
        """
        Find OSM ways that match a Strava segment.
        
        Args:
            segment_polyline: Encoded polyline from Strava segment
            max_distance: Maximum allowed distance between way and segment (meters)
            min_confidence: Minimum confidence score for a match (0-1)
            
        Returns:
            List of matching ways with confidence scores
        """
        # Decode the polyline
        segment_points = polyline.decode(segment_polyline)
        if not segment_points:
            return []

        # Get bounding box with some padding
        min_lat, min_lon, max_lat, max_lon = self._get_bounding_box(segment_points, padding=0.001)

        # Query OSM ways in the bounding box
        ways = await self.overpass_client.query_ways(min_lat, min_lon, max_lat, max_lon)
        
        # Convert ways to OSMWay objects
        osm_ways = [self._convert_to_osm_way(way) for way in ways]
        
        # Find matches
        matches = []
        for way in osm_ways:
            match = self._match_way_to_segment(way, segment_points, max_distance)
            if match and match.confidence >= min_confidence:
                matches.append(match)
        
        # Sort by confidence
        matches.sort(key=lambda x: x.confidence, reverse=True)
        return matches

    def _get_bounding_box(
        self,
        points: List[Tuple[float, float]],
        padding: float = 0.001
    ) -> Tuple[float, float, float, float]:
        """Get bounding box for points with padding."""
        lats, lons = zip(*points)
        return (
            min(lats) - padding,
            min(lons) - padding,
            max(lats) + padding,
            max(lons) + padding
        )

    def _convert_to_osm_way(self, way: dict) -> OSMWay:
        """Convert raw OSM way to OSMWay model."""
        nodes = [
            OSMNode(
                id=node['id'],
                lat=node['lat'],
                lon=node['lon']
            )
            for node in way.get('nodes', [])
        ]
        return OSMWay(
            id=way['id'],
            nodes=nodes,
            tags=way.get('tags', {})
        )

    def _match_way_to_segment(
        self,
        way: OSMWay,
        segment_points: List[Tuple[float, float]],
        max_distance: float
    ) -> Optional[WayMatchResult]:
        """
        Match a way to a segment and calculate confidence score.
        
        This uses a combination of:
        1. Point-to-point distance
        2. Direction of travel
        3. Way length vs segment length
        4. Way tags (highway type, etc.)
        """
        if not way.nodes or len(way.nodes) < 2:
            return None

        # Calculate distances and direction
        way_points = [(node.lat, node.lon) for node in way.nodes]
        forward_distance = self._calculate_path_distance(way_points, segment_points)
        reverse_distance = self._calculate_path_distance(way_points[::-1], segment_points)
        
        # Use the better matching direction
        if forward_distance <= reverse_distance:
            distance = forward_distance
            match_type = "forward"
        else:
            distance = reverse_distance
            match_type = "reverse"

        if distance > max_distance:
            return None

        # Calculate confidence score
        confidence = self._calculate_confidence(
            way,
            segment_points,
            distance,
            match_type
        )

        return WayMatchResult(
            way=way,
            match_score=1.0 - (distance / max_distance),
            match_type=match_type,
            distance=distance,
            confidence=confidence
        )

    def _calculate_path_distance(
        self,
        way_points: List[Tuple[float, float]],
        segment_points: List[Tuple[float, float]]
    ) -> float:
        """Calculate the total distance between two paths."""
        # Use dynamic time warping or similar algorithm here
        # For now, using a simple point-to-point distance
        total_distance = 0.0
        for seg_point in segment_points:
            min_dist = float('inf')
            for way_point in way_points:
                dist = self._haversine_distance(
                    seg_point[0], seg_point[1],
                    way_point[0], way_point[1]
                )
                min_dist = min(min_dist, dist)
            total_distance += min_dist
        return total_distance

    def _calculate_confidence(
        self,
        way: OSMWay,
        segment_points: List[Tuple[float, float]],
        distance: float,
        match_type: str
    ) -> float:
        """Calculate confidence score for a match."""
        # Start with distance-based confidence
        distance_confidence = 1.0 - (distance / 10.0)  # Assuming max_distance=10
        
        # Consider way tags
        tag_confidence = 1.0
        if 'highway' in way.tags:
            # Prefer certain highway types
            preferred_types = {'path', 'track', 'footway', 'residential', 'unclassified'}
            if way.tags['highway'] in preferred_types:
                tag_confidence = 1.0
            else:
                tag_confidence = 0.7
        
        # Consider length ratio
        way_length = self._calculate_way_length(way.nodes)
        segment_length = self._calculate_segment_length(segment_points)
        length_ratio = min(way_length, segment_length) / max(way_length, segment_length)
        
        # Combine factors
        confidence = (
            distance_confidence * 0.4 +
            tag_confidence * 0.3 +
            length_ratio * 0.3
        )
        
        return min(max(confidence, 0.0), 1.0)

    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate the Haversine distance between two points."""
        R = 6371000  # Earth's radius in meters
        lat1, lon1 = math.radians(lat1), math.radians(lon1)
        lat2, lon2 = math.radians(lat2), math.radians(lon2)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c

    def _calculate_way_length(self, nodes: List[OSMNode]) -> float:
        """Calculate the length of a way in meters."""
        if len(nodes) < 2:
            return 0.0

        total_length = 0.0
        for i in range(len(nodes) - 1):
            total_length += self._haversine_distance(
                nodes[i].lat, nodes[i].lon,
                nodes[i + 1].lat, nodes[i + 1].lon
            )
        return total_length

    def _calculate_segment_length(self, points: List[Tuple[float, float]]) -> float:
        """Calculate the length of a segment in meters."""
        if len(points) < 2:
            return 0.0

        total_length = 0.0
        for i in range(len(points) - 1):
            total_length += self._haversine_distance(
                points[i][0], points[i][1],
                points[i + 1][0], points[i + 1][1]
            )
        return total_length 