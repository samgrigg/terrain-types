from typing import List, Dict, Optional
import math
import polyline
from ..models.terrain import TerrainQuery, TerrainInfo

class TerrainService:
    """Service for terrain-related operations."""

    NATURAL_SURFACES = {
        'gravel', 'dirt', 'ground', 'earth', 'grass', 'sand', 'wood',
        'unpaved', 'natural', 'mud', 'rock', 'stone', 'pebblestone'
    }

    def __init__(self, overpass_client):
        """Initialize the service with an Overpass API client."""
        self.overpass_client = overpass_client

    async def get_terrain_info(self, query: TerrainQuery) -> TerrainInfo:
        """Get terrain information for a given query."""
        try:
            # Get ways from Overpass API
            ways = await self.overpass_client.query_ways(
                query.start_lat,
                query.start_lon,
                query.end_lat,
                query.end_lon
            )

            # Process ways to extract terrain information
            surfaces = set()
            tracktypes = set()
            highways = set()
            surface_distances = {}

            for way in ways:
                if self._is_way_relevant(way, query):
                    self._process_way_tags(way, surfaces, tracktypes, highways)
                    self._update_surface_distances(way, surface_distances)

            # Calculate natural surface percentage
            natural_percentage = self._calculate_natural_percentage(surfaces)

            return TerrainInfo(
                surfaces=list(surfaces),
                tracktypes=list(tracktypes),
                highways=list(highways),
                surface_distances=surface_distances,
                natural_percentage=natural_percentage
            )

        except Exception as e:
            # Log the error and return empty result
            print(f"Error getting terrain info: {str(e)}")
            return TerrainInfo()

    def _is_way_relevant(self, way: Dict, query: TerrainQuery) -> bool:
        """Check if a way is relevant to the query."""
        if not way.get('nodes'):
            return False

        # Check if any node is within the distance threshold
        for node in way['nodes']:
            if self._is_point_near_segment(
                node['lat'],
                node['lon'],
                query.start_lat,
                query.start_lon,
                query.end_lat,
                query.end_lon,
                query.distance_threshold
            ):
                return True
        return False

    def _process_way_tags(
        self,
        way: Dict,
        surfaces: set,
        tracktypes: set,
        highways: set
    ) -> None:
        """Process way tags to extract surface, tracktype, and highway information."""
        tags = way.get('tags', {})
        
        if 'surface' in tags:
            surfaces.add(tags['surface'])
        if 'tracktype' in tags:
            tracktypes.add(tags['tracktype'])
        if 'highway' in tags:
            highways.add(tags['highway'])

    def _update_surface_distances(self, way: Dict, surface_distances: Dict[str, float]) -> None:
        """Update surface distances based on way length."""
        tags = way.get('tags', {})
        if 'surface' in tags:
            surface = tags['surface']
            length = self._calculate_way_length(way['nodes'])
            surface_distances[surface] = surface_distances.get(surface, 0) + length

    def _calculate_natural_percentage(self, surfaces: set) -> float:
        """Calculate the percentage of natural surfaces."""
        if not surfaces:
            return 0.0

        natural_count = sum(1 for s in surfaces if self._is_natural_surface(s))
        return (natural_count / len(surfaces)) * 100

    def _is_natural_surface(self, surface: str) -> bool:
        """Check if a surface type is considered natural."""
        return any(natural in surface.lower() for natural in self.NATURAL_SURFACES)

    @staticmethod
    def _is_point_near_segment(
        point_lat: float,
        point_lon: float,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        threshold: float
    ) -> bool:
        """Check if a point is near a segment."""
        # Calculate distance from point to segment
        distance = TerrainService._point_to_segment_distance(
            point_lat, point_lon,
            start_lat, start_lon,
            end_lat, end_lon
        )
        return distance <= threshold

    @staticmethod
    def _point_to_segment_distance(
        point_lat: float,
        point_lon: float,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float
    ) -> float:
        """Calculate the distance from a point to a segment."""
        # Convert to radians
        point_lat, point_lon = math.radians(point_lat), math.radians(point_lon)
        start_lat, start_lon = math.radians(start_lat), math.radians(start_lon)
        end_lat, end_lon = math.radians(end_lat), math.radians(end_lon)

        # Calculate distances
        R = 6371000  # Earth's radius in meters
        dlat = end_lat - start_lat
        dlon = end_lon - start_lon
        a = math.sin(dlat/2)**2 + math.cos(start_lat) * math.cos(end_lat) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        segment_length = R * c

        if segment_length == 0:
            return TerrainService._haversine_distance(point_lat, point_lon, start_lat, start_lon)

        # Calculate projection
        t = ((point_lat - start_lat) * (end_lat - start_lat) +
             (point_lon - start_lon) * (end_lon - start_lon)) / (segment_length ** 2)
        t = max(0, min(1, t))

        # Calculate projected point
        proj_lat = start_lat + t * (end_lat - start_lat)
        proj_lon = start_lon + t * (end_lon - start_lon)

        return TerrainService._haversine_distance(point_lat, point_lon, proj_lat, proj_lon)

    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate the Haversine distance between two points."""
        R = 6371000  # Earth's radius in meters
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c

    @staticmethod
    def _calculate_way_length(nodes: List[Dict]) -> float:
        """Calculate the length of a way in meters."""
        if len(nodes) < 2:
            return 0.0

        total_length = 0.0
        for i in range(len(nodes) - 1):
            total_length += TerrainService._haversine_distance(
                math.radians(nodes[i]['lat']),
                math.radians(nodes[i]['lon']),
                math.radians(nodes[i + 1]['lat']),
                math.radians(nodes[i + 1]['lon'])
            )
        return total_length 