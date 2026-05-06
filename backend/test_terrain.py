from unittest.mock import AsyncMock

import polyline
import pytest

from app.models.terrain import TerrainQuery
from app.services.terrain_service import TerrainService


ROUTE_POINTS = [
    (40.0000, -105.0000),
    (40.0000, -104.9995),
    (40.0000, -104.9990),
]


def build_way(way_id, tags, points):
    return {
        "id": way_id,
        "tags": tags,
        "nodes": [
            {"id": index + 1, "lat": point[0], "lon": point[1]}
            for index, point in enumerate(points)
        ],
    }


@pytest.mark.anyio
async def test_terrain_service_prefers_geometry_match_over_nearby_parallel_road():
    overpass_client = AsyncMock()
    overpass_client.query_ways.return_value = [
        build_way(
            1,
            {"highway": "track", "surface": "gravel", "tracktype": "grade2"},
            ROUTE_POINTS,
        ),
        build_way(
            2,
            {"highway": "residential", "surface": "asphalt"},
            [(lat + 0.0004, lon) for lat, lon in ROUTE_POINTS],
        ),
    ]
    service = TerrainService(overpass_client)
    query = TerrainQuery(
        start_lat=ROUTE_POINTS[0][0],
        start_lon=ROUTE_POINTS[0][1],
        end_lat=ROUTE_POINTS[-1][0],
        end_lon=ROUTE_POINTS[-1][1],
        polyline=polyline.encode(ROUTE_POINTS),
        distance_threshold=25.0,
    )

    result = await service.get_terrain_info(query)

    assert result.surfaces[0] == "gravel"
    assert "asphalt" not in result.surfaces
    assert result.natural_percentage == 100.0
    assert result.surface_distances["gravel"] == result.total_distance


@pytest.mark.anyio
async def test_terrain_service_supports_legacy_degree_threshold_values():
    overpass_client = AsyncMock()
    overpass_client.query_ways.return_value = [
        build_way(1, {"highway": "track", "surface": "dirt"}, ROUTE_POINTS)
    ]
    service = TerrainService(overpass_client)
    query = TerrainQuery(
        start_lat=ROUTE_POINTS[0][0],
        start_lon=ROUTE_POINTS[0][1],
        end_lat=ROUTE_POINTS[-1][0],
        end_lon=ROUTE_POINTS[-1][1],
        polyline=polyline.encode(ROUTE_POINTS),
        distance_threshold=0.0001,
    )

    result = await service.get_terrain_info(query)

    assert result.natural_percentage == 100.0
    assert result.matched_distance == result.total_distance


@pytest.mark.anyio
async def test_terrain_service_marks_unmatched_distance_as_unknown():
    overpass_client = AsyncMock()
    overpass_client.query_ways.return_value = []
    service = TerrainService(overpass_client)
    query = TerrainQuery(
        start_lat=ROUTE_POINTS[0][0],
        start_lon=ROUTE_POINTS[0][1],
        end_lat=ROUTE_POINTS[-1][0],
        end_lon=ROUTE_POINTS[-1][1],
        polyline=polyline.encode(ROUTE_POINTS),
        distance_threshold=25.0,
    )

    result = await service.get_terrain_info(query)

    assert result.surfaces == ["unknown"]
    assert result.matched_distance == 0.0
    assert result.unmatched_distance == result.total_distance
    assert result.natural_percentage == 0.0


@pytest.mark.anyio
async def test_terrain_service_returns_runs_matching_surface_buckets():
    overpass_client = AsyncMock()
    overpass_client.query_ways.return_value = [
        build_way(
            1,
            {"highway": "track", "surface": "gravel", "tracktype": "grade2"},
            ROUTE_POINTS,
        ),
    ]
    service = TerrainService(overpass_client)
    query = TerrainQuery(
        start_lat=ROUTE_POINTS[0][0],
        start_lon=ROUTE_POINTS[0][1],
        end_lat=ROUTE_POINTS[-1][0],
        end_lon=ROUTE_POINTS[-1][1],
        polyline=polyline.encode(ROUTE_POINTS),
        distance_threshold=25.0,
    )

    result = await service.get_terrain_info(query)

    assert result.runs, "runs must be non-empty for a matched polyline"
    assert all(r.bucket in ("paved", "dirt", "unknown") for r in result.runs)
    assert result.runs[0].start_index == 0
    assert result.runs[-1].end_index == len(ROUTE_POINTS) - 1
    assert len(result.runs) == 1
    assert result.runs[0].bucket == "dirt"
