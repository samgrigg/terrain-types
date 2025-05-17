from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import os

from .models.terrain import TerrainRequest, TerrainInfo
from .models.strava import (
    StravaToken,
    StravaAuthRequest,
    StravaRefreshRequest,
    StravaActivity,
    StravaSegment
)
from .models.osm import WayMatchResult
from .models.terrain import TerrainQuery
from .services.terrain_service import TerrainService
from .services.strava_service import StravaService
from .services.way_matching_service import WayMatchingService
from .utils.overpass_client import OverpassClient
from .utils.strava_client import StravaClient

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
overpass_client = OverpassClient()
strava_client = StravaClient()

# Initialize services
terrain_service = TerrainService(overpass_client)
strava_service = StravaService(strava_client)
way_matching_service = WayMatchingService(overpass_client)

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}

@app.get("/strava/auth-url")
async def get_strava_auth_url():
    """Get Strava authorization URL."""
    client_id = os.getenv('STRAVA_CLIENT_ID')
    redirect_uri = os.getenv('STRAVA_REDIRECT_URI')
    return {
        "url": f"https://www.strava.com/oauth/authorize?client_id={client_id}&response_type=code&redirect_uri={redirect_uri}&approval_prompt=force&scope=read,activity:read"
    }

@app.post("/strava/token", response_model=StravaToken)
async def exchange_token(request: StravaAuthRequest):
    """Exchange authorization code for access token."""
    try:
        return await strava_service.get_token(request.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/strava/refresh", response_model=StravaToken)
async def refresh_token(request: StravaRefreshRequest):
    """Refresh access token."""
    try:
        return await strava_service.refresh_token(request.refresh_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/strava/activities/{activity_id}", response_model=StravaActivity)
async def get_activity(
    activity_id: int,
    authorization: str = Header(..., description="Bearer token")
):
    """Get activity details."""
    try:
        access_token = authorization.replace("Bearer ", "")
        return await strava_service.get_activity(activity_id, access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/strava/segments/{segment_id}", response_model=StravaSegment)
async def get_segment(
    segment_id: int,
    authorization: str = Header(..., description="Bearer token")
):
    """Get segment details."""
    try:
        access_token = authorization.replace("Bearer ", "")
        return await strava_service.get_segment(segment_id, access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/terrain/info", response_model=TerrainInfo)
async def get_terrain_info(request: TerrainRequest):
    """Get terrain information."""
    try:
        query = request.to_terrain_query()
        return await terrain_service.get_terrain_info(query)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/osm/match/{segment_id}", response_model=List[WayMatchResult])
async def match_segment_to_ways(
    segment_id: int,
    authorization: str = Header(...),
    max_distance: float = 10.0,
    min_confidence: float = 0.7
):
    """
    Match a Strava segment to OSM ways.
    
    Args:
        segment_id: Strava segment ID
        authorization: Bearer token for Strava API
        max_distance: Maximum allowed distance between way and segment (meters)
        min_confidence: Minimum confidence score for a match (0-1)
        
    Returns:
        List of matching ways with confidence scores
    """
    try:
        # Get segment details from Strava
        token = authorization.replace("Bearer ", "")
        segment = await strava_service.get_segment(segment_id, token)
        
        if not segment or not segment.get('map', {}).get('polyline'):
            raise HTTPException(
                status_code=404,
                detail="Segment not found or no polyline available"
            )
        
        # Find matching ways
        matches = await way_matching_service.find_matching_ways(
            segment['map']['polyline'],
            max_distance=max_distance,
            min_confidence=min_confidence
        )
        
        return matches
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error matching segment to ways: {str(e)}"
        ) 