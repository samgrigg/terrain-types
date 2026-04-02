from collections import defaultdict
from typing import Dict, List, Optional, Tuple
import math

import polyline

from ..models.terrain import TerrainInfo, TerrainQuery


Coordinate = Tuple[float, float]


class TerrainService:
    """Service for matching route geometry to OSM ways and inferring terrain."""

    NATURAL_SURFACES = {
        "bridleway",
        "compacted",
        "dirt",
        "earth",
        "fine_gravel",
        "grass",
        "gravel",
        "ground",
        "mud",
        "path",
        "pebblestone",
        "rock",
        "sand",
        "track",
        "unpaved",
    }
    NATURAL_TRACKTYPES = {"track_grade2", "track_grade3", "track_grade4", "track_grade5"}

    def __init__(self, overpass_client):
        self.overpass_client = overpass_client

    async def get_terrain_info(self, query: TerrainQuery) -> TerrainInfo:
        route_points = self._get_route_points(query)
        if len(route_points) < 2:
            return TerrainInfo()

        min_lat, min_lon, max_lat, max_lon = self._get_bounding_box(route_points, padding=0.0005)
        ways = await self.overpass_client.query_ways(min_lat, min_lon, max_lat, max_lon)
        way_segments = self._build_way_segments(ways)

        threshold_meters = self._effective_threshold_meters(query.distance_threshold)
        total_distance = 0.0
        matched_distance = 0.0
        surfaces = set()
        tracktypes = set()
        highways = set()
        surface_distances = defaultdict(float)

        for start, end in zip(route_points, route_points[1:]):
            segment_length = self._haversine_distance(start[0], start[1], end[0], end[1])
            if segment_length == 0:
                continue

            total_distance += segment_length
            best_match = self._find_best_way_segment(start, end, way_segments, threshold_meters)

            if best_match:
                matched_distance += segment_length
                tags = best_match["tags"]
                surface = self._classify_surface(tags)
                tracktype = tags.get("tracktype")
                highway = tags.get("highway")

                if tracktype:
                    tracktypes.add(tracktype)
                if highway:
                    highways.add(highway)
            else:
                surface = "unknown"

            surfaces.add(surface)
            surface_distances[surface] += segment_length

        natural_distance = sum(
            distance
            for surface, distance in surface_distances.items()
            if self._is_natural_surface(surface)
        )
        unmatched_distance = max(total_distance - matched_distance, 0.0)

        ordered_surface_distances = dict(
            sorted(
                ((surface, round(distance, 1)) for surface, distance in surface_distances.items()),
                key=lambda item: item[1],
                reverse=True,
            )
        )

        return TerrainInfo(
            surfaces=sorted(surfaces),
            tracktypes=sorted(tracktypes),
            highways=sorted(highways),
            surface_distances=ordered_surface_distances,
            natural_percentage=round((natural_distance / total_distance) * 100, 1) if total_distance else 0.0,
            total_distance=round(total_distance, 1),
            matched_distance=round(matched_distance, 1),
            unmatched_distance=round(unmatched_distance, 1),
        )

    def _get_route_points(self, query: TerrainQuery) -> List[Coordinate]:
        if query.polyline:
            try:
                points = polyline.decode(query.polyline)
            except (TypeError, ValueError):
                points = []
            if len(points) >= 2:
                return [(float(lat), float(lon)) for lat, lon in points]

        return [
            (query.start_lat, query.start_lon),
            (query.end_lat, query.end_lon),
        ]

    def _effective_threshold_meters(self, raw_threshold: float) -> float:
        # Older clients sent degrees (~0.0001 ~= 11m). Treat sub-1 values as degrees.
        if raw_threshold < 1:
            return raw_threshold * 111_320
        return raw_threshold

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

    def _build_way_segments(self, ways: List[Dict]) -> List[Dict]:
        segments: List[Dict] = []
        for way in ways:
            nodes = way.get("nodes", [])
            if len(nodes) < 2:
                continue

            tags = {key: value.lower() for key, value in way.get("tags", {}).items()}
            for start_node, end_node in zip(nodes, nodes[1:]):
                start = (start_node["lat"], start_node["lon"])
                end = (end_node["lat"], end_node["lon"])
                length = self._haversine_distance(start[0], start[1], end[0], end[1])
                if length == 0:
                    continue
                segments.append(
                    {
                        "way_id": way["id"],
                        "tags": tags,
                        "start": start,
                        "end": end,
                        "bearing": self._bearing(start, end),
                        "length": length,
                    }
                )
        return segments

    def _find_best_way_segment(
        self,
        start: Coordinate,
        end: Coordinate,
        way_segments: List[Dict],
        threshold_meters: float,
    ) -> Optional[Dict]:
        if not way_segments:
            return None

        midpoint = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        route_bearing = self._bearing(start, end)
        best_match = None
        best_score = float("inf")

        for candidate in way_segments:
            distance = self._point_to_segment_distance(midpoint, candidate["start"], candidate["end"])
            if distance > threshold_meters:
                continue

            heading_delta = self._orientation_delta(route_bearing, candidate["bearing"])
            score = distance + (heading_delta / 180.0) * threshold_meters
            if score < best_score:
                best_score = score
                best_match = candidate

        return best_match

    def _classify_surface(self, tags: Dict[str, str]) -> str:
        surface = tags.get("surface")
        if surface:
            return surface

        tracktype = tags.get("tracktype")
        if tracktype in {"grade2", "grade3", "grade4", "grade5"}:
            return f"track_{tracktype}"
        if tracktype == "grade1":
            return "compacted"

        highway = tags.get("highway")
        if highway in {"bridleway", "path", "track"}:
            return highway
        return "unknown"

    def _is_natural_surface(self, surface: str) -> bool:
        normalized = surface.lower()
        return normalized in self.NATURAL_SURFACES or normalized in self.NATURAL_TRACKTYPES

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

    def _bearing(self, start: Coordinate, end: Coordinate) -> float:
        start_lat = math.radians(start[0])
        end_lat = math.radians(end[0])
        delta_lon = math.radians(end[1] - start[1])
        x = math.sin(delta_lon) * math.cos(end_lat)
        y = math.cos(start_lat) * math.sin(end_lat) - (
            math.sin(start_lat) * math.cos(end_lat) * math.cos(delta_lon)
        )
        bearing = math.degrees(math.atan2(x, y))
        return (bearing + 360.0) % 360.0

    def _orientation_delta(self, bearing_a: float, bearing_b: float) -> float:
        delta = abs(bearing_a - bearing_b) % 360.0
        return min(delta, 360.0 - delta)

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6_371_000
        lat1, lon1 = math.radians(lat1), math.radians(lon1)
        lat2, lon2 = math.radians(lat2), math.radians(lon2)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius * c
