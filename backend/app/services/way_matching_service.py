from typing import List, Optional, Tuple
import math

import polyline

from ..models.osm import OSMNode, OSMWay, WayMatchResult
from ..utils.overpass_client import OverpassClient


Coordinate = Tuple[float, float]


class WayMatchingService:
    """Service for matching a Strava segment polyline to nearby OSM ways."""

    def __init__(self, overpass_client: OverpassClient):
        self.overpass_client = overpass_client

    async def find_matching_ways(
        self,
        segment_polyline: str,
        max_distance: float = 20.0,
        min_confidence: float = 0.5,
    ) -> List[WayMatchResult]:
        segment_points = polyline.decode(segment_polyline)
        if len(segment_points) < 2:
            return []

        min_lat, min_lon, max_lat, max_lon = self._get_bounding_box(segment_points, padding=0.0005)
        raw_ways = await self.overpass_client.query_ways(min_lat, min_lon, max_lat, max_lon)
        osm_ways = [self._convert_to_osm_way(way) for way in raw_ways if len(way.get("nodes", [])) >= 2]

        matches = []
        for way in osm_ways:
            match = self._match_way_to_segment(way, segment_points, max_distance)
            if match and match.confidence >= min_confidence:
                matches.append(match)

        matches.sort(key=lambda match: match.confidence, reverse=True)
        return matches

    def _get_bounding_box(
        self,
        points: List[Coordinate],
        padding: float = 0.0005,
    ) -> Tuple[float, float, float, float]:
        lats, lons = zip(*points)
        return (
            min(lats) - padding,
            min(lons) - padding,
            max(lats) + padding,
            max(lons) + padding,
        )

    def _convert_to_osm_way(self, way: dict) -> OSMWay:
        return OSMWay(
            id=way["id"],
            nodes=[
                OSMNode(id=node["id"], lat=node["lat"], lon=node["lon"])
                for node in way.get("nodes", [])
            ],
            tags=way.get("tags", {}),
        )

    def _match_way_to_segment(
        self,
        way: OSMWay,
        segment_points: List[Coordinate],
        max_distance: float,
    ) -> Optional[WayMatchResult]:
        way_points = [(node.lat, node.lon) for node in way.nodes]
        if len(way_points) < 2:
            return None

        forward_distance = self._average_min_distance(segment_points, way_points)
        reverse_distance = self._average_min_distance(segment_points, list(reversed(way_points)))

        if forward_distance <= reverse_distance:
            average_distance = forward_distance
            match_type = "forward"
        else:
            average_distance = reverse_distance
            match_type = "reverse"

        if average_distance > max_distance:
            return None

        coverage = self._coverage_ratio(segment_points, way_points, max_distance)
        way_length = self._calculate_path_length(way_points)
        segment_length = self._calculate_path_length(segment_points)
        length_ratio = min(way_length, segment_length) / max(way_length, segment_length) if way_length and segment_length else 0.0
        distance_score = max(0.0, 1.0 - (average_distance / max_distance))
        confidence = min(1.0, coverage * 0.5 + distance_score * 0.3 + length_ratio * 0.2)

        return WayMatchResult(
            way=way,
            match_score=round(distance_score, 3),
            match_type=match_type,
            distance=round(average_distance, 1),
            confidence=round(confidence, 3),
        )

    def _average_min_distance(self, segment_points: List[Coordinate], way_points: List[Coordinate]) -> float:
        sample_points = segment_points[:: max(1, len(segment_points) // 40)]
        if sample_points[-1] != segment_points[-1]:
            sample_points = sample_points + [segment_points[-1]]

        distances = []
        for point in sample_points:
            min_distance = min(
                self._point_to_segment_distance(point, start, end)
                for start, end in zip(way_points, way_points[1:])
            )
            distances.append(min_distance)
        return sum(distances) / len(distances) if distances else float("inf")

    def _coverage_ratio(
        self,
        segment_points: List[Coordinate],
        way_points: List[Coordinate],
        max_distance: float,
    ) -> float:
        close_points = 0
        for point in segment_points:
            min_distance = min(
                self._point_to_segment_distance(point, start, end)
                for start, end in zip(way_points, way_points[1:])
            )
            if min_distance <= max_distance:
                close_points += 1
        return close_points / len(segment_points) if segment_points else 0.0

    def _calculate_path_length(self, points: List[Coordinate]) -> float:
        return sum(
            self._haversine_distance(start[0], start[1], end[0], end[1])
            for start, end in zip(points, points[1:])
        )

    def _point_to_segment_distance(
        self,
        point: Coordinate,
        start: Coordinate,
        end: Coordinate,
    ) -> float:
        origin = point
        px, py = self._to_xy(point, origin)
        sx, sy = self._to_xy(start, origin)
        ex, ey = self._to_xy(end, origin)
        dx = ex - sx
        dy = ey - sy

        if dx == 0 and dy == 0:
            return math.hypot(px - sx, py - sy)

        projection = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)
        projection = max(0.0, min(1.0, projection))
        closest_x = sx + projection * dx
        closest_y = sy + projection * dy
        return math.hypot(px - closest_x, py - closest_y)

    def _to_xy(self, point: Coordinate, origin: Coordinate) -> Tuple[float, float]:
        lat_scale = 111_320
        lon_scale = 111_320 * math.cos(math.radians(origin[0]))
        x = (point[1] - origin[1]) * lon_scale
        y = (point[0] - origin[0]) * lat_scale
        return x, y

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6_371_000
        lat1, lon1 = math.radians(lat1), math.radians(lon1)
        lat2, lon2 = math.radians(lat2), math.radians(lon2)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius * c
