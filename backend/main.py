import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import requests
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import settings
from app.models.strava import (
    StravaAuthRequest,
    StravaSegment,
    StravaToken,
    StravaActivity,
    StravaRefreshRequest,
)
from app.models.terrain import TerrainInfo, TerrainRequest
from app.services.strava_service import StravaService
from app.services.terrain_service import TerrainService
from app.services.way_matching_service import WayMatchingService
from app.utils.overpass_client import OverpassClient
from app.utils.strava_client import StravaClient


app = FastAPI()

allowed_origins = sorted({settings.FRONTEND_URL.rstrip("/"), "http://localhost:3000"})
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

overpass_client = OverpassClient()
strava_client = StravaClient()
terrain_service = TerrainService(overpass_client)
strava_service = StravaService(strava_client)
way_matching_service = WayMatchingService(overpass_client)


def refresh_access_token(refresh_token: str) -> Dict[str, Any]:
    """Refresh a Strava access token using the provided refresh token."""
    response = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    try:
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"Failed to refresh token: {exc}") from exc
    return response.json()


def get_valid_token(access_token: str, refresh_token: str, expires_at: int) -> str:
    """Return a valid Strava access token, refreshing it when necessary."""
    if time.time() >= expires_at - 300:
        return refresh_access_token(refresh_token)["access_token"]
    return access_token


def _extract_bearer_token(authorization: str) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header must be a Bearer token")
    return authorization.replace("Bearer ", "", 1)


def _fetch_strava_resource(
    path: str,
    access_token: str,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    response = requests.get(
        f"{settings.STRAVA_API_URL}{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params,
        timeout=30,
    )
    try:
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return response.json()


def _fetch_strava_collection(
    path: str,
    access_token: str,
    params: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    response = requests.get(
        f"{settings.STRAVA_API_URL}{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params,
        timeout=30,
    )
    try:
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return response.json()


def _normalize_segment_effort(effort: Dict[str, Any]) -> Dict[str, Any]:
    segment = effort.get("segment", {})
    return {
        "id": effort.get("id"),
        "name": segment.get("name"),
        "start_index": effort.get("start_index", 0),
        "end_index": effort.get("end_index", 0),
        "elapsed_time": effort.get("elapsed_time"),
        "moving_time": effort.get("moving_time"),
        "start_date": effort.get("start_date"),
        "segment": {
            "id": segment.get("id"),
            "name": segment.get("name"),
            "distance": segment.get("distance", 0),
            "average_grade": segment.get("average_grade", 0),
            "map": segment.get("map") or {},
            "start_latlng": segment.get("start_latlng"),
            "end_latlng": segment.get("end_latlng"),
        },
    }


def _normalize_activity_details(activity: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": activity["id"],
        "name": activity["name"],
        "type": activity.get("type"),
        "distance": activity.get("distance", 0),
        "moving_time": activity.get("moving_time", 0),
        "elapsed_time": activity.get("elapsed_time", 0),
        "start_date": activity.get("start_date"),
        "map": activity.get("map") or {},
        "segments": [
            _normalize_segment_effort(effort)
            for effort in activity.get("segment_efforts", [])
            if effort.get("segment", {}).get("id")
        ],
    }


async def get_strava_token(code: str) -> Dict[str, Any]:
    return (await strava_service.get_token(code)).model_dump()


async def refresh_strava_token(refresh_token: str) -> Dict[str, Any]:
    return (await strava_service.refresh_token(refresh_token)).model_dump()


@app.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/strava/auth-url")
async def get_strava_auth_url() -> Dict[str, str]:
    return {
        "url": (
            "https://www.strava.com/oauth/authorize"
            f"?client_id={settings.STRAVA_CLIENT_ID}"
            "&response_type=code"
            f"&redirect_uri={settings.STRAVA_REDIRECT_URI}"
            "&approval_prompt=force"
            "&scope=read,activity:read"
        )
    }


@app.post("/strava/token", response_model=StravaToken)
async def exchange_token(request: StravaAuthRequest) -> StravaToken:
    try:
        return StravaToken(**await get_strava_token(request.code))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/strava/refresh", response_model=StravaToken)
async def refresh_token(request: StravaRefreshRequest) -> StravaToken:
    try:
        return StravaToken(**await refresh_strava_token(request.refresh_token))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/strava/activities/{activity_id}", response_model=StravaActivity)
async def get_activity(
    activity_id: int,
    authorization: str = Header(..., description="Bearer token"),
) -> StravaActivity:
    try:
        return await strava_service.get_activity(activity_id, _extract_bearer_token(authorization))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/strava/segments/{segment_id}", response_model=StravaSegment)
async def get_segment(
    segment_id: int,
    authorization: str = Header(..., description="Bearer token"),
) -> StravaSegment:
    try:
        return await strava_service.get_segment(segment_id, _extract_bearer_token(authorization))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/terrain/info", response_model=TerrainInfo)
@app.post("/api/terrain", response_model=TerrainInfo)
async def get_terrain_info(request: TerrainRequest) -> TerrainInfo:
    try:
        return await terrain_service.get_terrain_info(request.to_terrain_query())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/auth/callback")
async def strava_callback(code: str) -> RedirectResponse:
    response = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    try:
        response.raise_for_status()
        token_data = response.json()
        params = {
            "access_token": token_data["access_token"],
            "refresh_token": token_data["refresh_token"],
            "expires_at": token_data["expires_at"],
        }
        return RedirectResponse(f"{settings.FRONTEND_URL}/auth/success?{urlencode(params)}")
    except requests.RequestException as exc:
        return RedirectResponse(f"{settings.FRONTEND_URL}/auth/error?error={exc}")
    except (KeyError, TypeError, ValueError) as exc:
        return RedirectResponse(f"{settings.FRONTEND_URL}/auth/error?error={exc}")


@app.get("/api/activities")
async def get_activities(access_token: str, refresh_token: str, expires_at: int) -> List[Dict[str, Any]]:
    valid_token = get_valid_token(access_token, refresh_token, expires_at)
    activities = _fetch_strava_collection(
        "/athlete/activities",
        valid_token,
        params={"per_page": 30},
    )
    return [
        {
            "id": activity["id"],
            "name": activity["name"],
            "type": activity.get("type"),
            "distance": activity.get("distance", 0),
            "moving_time": activity.get("moving_time", 0),
            "elapsed_time": activity.get("elapsed_time", 0),
            "start_date": activity.get("start_date"),
            "has_map": bool((activity.get("map") or {}).get("summary_polyline") or (activity.get("map") or {}).get("polyline")),
        }
        for activity in activities
    ]


@app.get("/api/activities/{activity_id}")
async def get_activity_details(
    activity_id: int,
    access_token: str,
    refresh_token: str,
    expires_at: int,
) -> Dict[str, Any]:
    valid_token = get_valid_token(access_token, refresh_token, expires_at)
    activity = _fetch_strava_resource(
        f"/activities/{activity_id}",
        valid_token,
        params={"include_all_efforts": "true"},
    )
    return _normalize_activity_details(activity)


@app.get("/api/activities/download")
async def download_activities(access_token: str, refresh_token: str, expires_at: int) -> JSONResponse:
    valid_token = get_valid_token(access_token, refresh_token, expires_at)
    activities = _fetch_strava_collection("/athlete/activities", valid_token)
    return JSONResponse(
        content=activities,
        headers={"Content-Disposition": "attachment; filename=strava_activities.json"},
    )


@app.get("/api/segment/{segment_id}")
async def get_segment_details(
    segment_id: int,
    access_token: str,
    refresh_token: str,
    expires_at: int,
) -> Dict[str, Any]:
    valid_token = get_valid_token(access_token, refresh_token, expires_at)
    return _fetch_strava_resource(f"/segments/{segment_id}", valid_token)


@app.get("/api/segments/{segment_id}/match")
@app.get("/osm/match/{segment_id}")
async def match_segment_to_ways(
    segment_id: int,
    authorization: str = Header(..., description="Bearer token"),
    max_distance: float = 20.0,
    min_confidence: float = 0.5,
) -> List[Dict[str, Any]]:
    try:
        segment = await strava_service.get_segment(segment_id, _extract_bearer_token(authorization))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    polyline = segment.map.polyline if segment.map else None
    if not polyline:
        raise HTTPException(status_code=404, detail="Segment not found or no polyline available")

    matches = await way_matching_service.find_matching_ways(
        polyline,
        max_distance=max_distance,
        min_confidence=min_confidence,
    )
    return [match.model_dump() for match in matches]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
