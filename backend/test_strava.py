from unittest.mock import AsyncMock

import pytest

import main
from app.models.strava import StravaActivity, StravaMap, StravaSegment, StravaToken


@pytest.mark.anyio
async def test_get_strava_token_wrapper(monkeypatch):
    monkeypatch.setattr(
        main.strava_service,
        "get_token",
        AsyncMock(return_value=StravaToken(access_token="token", refresh_token="refresh", expires_at=123)),
    )

    result = await main.get_strava_token("code")

    assert result == {
        "access_token": "token",
        "refresh_token": "refresh",
        "expires_at": 123,
    }


@pytest.mark.anyio
async def test_refresh_strava_token_wrapper(monkeypatch):
    monkeypatch.setattr(
        main.strava_service,
        "refresh_token",
        AsyncMock(return_value=StravaToken(access_token="new", refresh_token="refresh", expires_at=456)),
    )

    result = await main.refresh_strava_token("refresh")

    assert result["access_token"] == "new"


@pytest.mark.anyio
async def test_header_backed_activity_endpoint_uses_strava_service(monkeypatch):
    monkeypatch.setattr(
        main.strava_service,
        "get_activity",
        AsyncMock(
            return_value=StravaActivity(
                id=1,
                name="Evening Ride",
                map=StravaMap(polyline="encoded"),
            )
        ),
    )

    activity = await main.get_activity(1, authorization="Bearer token")

    assert activity.id == 1
    main.strava_service.get_activity.assert_awaited_once_with(1, "token")


@pytest.mark.anyio
async def test_header_backed_segment_endpoint_uses_strava_service(monkeypatch):
    monkeypatch.setattr(
        main.strava_service,
        "get_segment",
        AsyncMock(
            return_value=StravaSegment(
                id=10,
                name="Ridge Climb",
                distance=500.0,
                average_grade=5.0,
                map=StravaMap(polyline="encoded"),
            )
        ),
    )

    segment = await main.get_segment(10, authorization="Bearer token")

    assert segment.id == 10
    main.strava_service.get_segment.assert_awaited_once_with(10, "token")
