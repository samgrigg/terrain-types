from unittest.mock import AsyncMock

import httpx
import pytest
import requests

import main
from app.models.osm import OSMNode, OSMWay, WayMatchResult
from app.models.strava import StravaMap, StravaSegment, StravaToken
from app.models.terrain import TerrainInfo


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"status={self.status_code}")


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest.mark.anyio
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_strava_auth_url_contains_configured_values(client, monkeypatch):
    monkeypatch.setattr(main.settings, "STRAVA_CLIENT_ID", "12345")
    monkeypatch.setattr(main.settings, "STRAVA_REDIRECT_URI", "http://localhost:8000/api/auth/callback")

    response = await client.get("/strava/auth-url")

    assert response.status_code == 200
    assert "client_id=12345" in response.json()["url"]
    assert "redirect_uri=http://localhost:8000/api/auth/callback" in response.json()["url"]


@pytest.mark.anyio
async def test_strava_token_exchange(client, monkeypatch):
    monkeypatch.setattr(
        main.strava_service,
        "get_token",
        AsyncMock(return_value=StravaToken(access_token="token", refresh_token="refresh", expires_at=123)),
    )

    response = await client.post("/strava/token", json={"code": "test-code"})

    assert response.status_code == 200
    assert response.json()["access_token"] == "token"


@pytest.mark.anyio
async def test_get_activities_returns_simplified_payload(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "_fetch_strava_collection",
        lambda path, access_token, params=None: [
            {
                "id": 1,
                "name": "Lunch Ride",
                "type": "Ride",
                "distance": 12345,
                "moving_time": 3600,
                "elapsed_time": 3700,
                "start_date": "2026-04-01T12:00:00Z",
                "map": {"summary_polyline": "abc"},
            }
        ],
    )

    response = await client.get(
        "/api/activities",
        params={
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_at": 9999999999,
        },
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 1,
            "name": "Lunch Ride",
            "type": "Ride",
            "distance": 12345,
            "moving_time": 3600,
            "elapsed_time": 3700,
            "start_date": "2026-04-01T12:00:00Z",
            "has_map": True,
        }
    ]


@pytest.mark.anyio
async def test_get_activity_details_normalizes_segment_efforts(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "_fetch_strava_resource",
        lambda path, access_token, params=None: {
            "id": 42,
            "name": "Foothills Loop",
            "type": "Ride",
            "distance": 25000,
            "moving_time": 5400,
            "elapsed_time": 5500,
            "start_date": "2026-04-01T18:00:00Z",
            "map": {"polyline": "encoded"},
            "segment_efforts": [
                {
                    "id": 999,
                    "elapsed_time": 120,
                    "moving_time": 110,
                    "start_date": "2026-04-01T18:10:00Z",
                    "start_index": 5,
                    "end_index": 12,
                    "segment": {
                        "id": 1001,
                        "name": "Climb",
                        "distance": 850,
                        "average_grade": 4.8,
                        "start_latlng": [40.0, -105.0],
                        "end_latlng": [40.01, -104.99],
                    },
                }
            ],
        },
    )

    response = await client.get(
        "/api/activities/42",
        params={
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_at": 9999999999,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == 42
    assert payload["segments"][0]["start_index"] == 5
    assert payload["segments"][0]["segment"]["id"] == 1001
    assert payload["segments"][0]["segment"]["average_grade"] == 4.8


@pytest.mark.anyio
async def test_get_terrain_info_returns_service_payload(client, monkeypatch):
    monkeypatch.setattr(
        main.terrain_service,
        "get_terrain_info",
        AsyncMock(
            return_value=TerrainInfo(
                surfaces=["gravel", "unknown"],
                tracktypes=["grade2"],
                highways=["track"],
                surface_distances={"gravel": 800.0, "unknown": 200.0},
                natural_percentage=80.0,
                total_distance=1000.0,
                matched_distance=900.0,
                unmatched_distance=100.0,
            )
        ),
    )

    response = await client.post(
        "/api/terrain",
        json={
            "start_lat": 40.0,
            "start_lon": -105.0,
            "end_lat": 40.01,
            "end_lon": -104.99,
            "polyline": "encoded",
            "distance_threshold": 25.0,
        },
    )

    assert response.status_code == 200
    assert response.json()["natural_percentage"] == 80.0
    assert response.json()["matched_distance"] == 900.0


@pytest.mark.anyio
async def test_match_segment_to_ways_uses_strava_segment_polyline(client, monkeypatch):
    monkeypatch.setattr(
        main.strava_service,
        "get_segment",
        AsyncMock(
            return_value=StravaSegment(
                id=77,
                name="Connector",
                distance=500.0,
                average_grade=1.0,
                map=StravaMap(polyline="encoded"),
            )
        ),
    )
    monkeypatch.setattr(
        main.way_matching_service,
        "find_matching_ways",
        AsyncMock(
            return_value=[
                WayMatchResult(
                    way=OSMWay(
                        id=11,
                        nodes=[
                            OSMNode(id=1, lat=40.0, lon=-105.0),
                            OSMNode(id=2, lat=40.001, lon=-104.999),
                        ],
                        tags={"highway": "track", "surface": "gravel"},
                    ),
                    match_score=0.9,
                    match_type="forward",
                    distance=4.2,
                    confidence=0.88,
                )
            ]
        ),
    )

    response = await client.get(
        "/osm/match/77",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["way"]["id"] == 11
    assert payload[0]["confidence"] == 0.88
