from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
import requests
import os
from dotenv import load_dotenv
from typing import Optional, List, Dict
import json
from urllib.parse import urlencode
import time
import logging
from polyline import decode
import math
from app.models.strava import (
    StravaToken,
    StravaAuthRequest,
    StravaRefreshRequest,
    StravaActivity,
    StravaSegment
)
from app.models.terrain import TerrainRequest, TerrainInfo
from app.services.strava_service import StravaService
from app.services.terrain_service import TerrainService
from app.services.way_matching_service import WayMatchingService, WayMatchResult
from app.utils.overpass_client import OverpassClient
from app.utils.strava_client import StravaClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Strava API configuration
STRAVA_API_URL = "https://www.strava.com/api/v3"
STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Overpass API configuration
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"

class Activity(BaseModel):
    id: int
    name: str
    distance: float
    moving_time: int
    elapsed_time: int
    type: str
    start_date: str
    description: Optional[str] = None
    map: Optional[dict] = None

class TerrainQuery(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    polyline: Optional[str] = None  # Add polyline data
    distance_threshold: float = 0.0001  # Default threshold in degrees (roughly 10 meters)

def refresh_access_token(refresh_token: str) -> Dict:
    """Refresh the Strava access token using the refresh token."""
    try:
        response = requests.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            }
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to refresh token: {str(e)}")

def get_valid_token(access_token: str, refresh_token: str, expires_at: int) -> str:
    """Get a valid access token, refreshing if necessary."""
    # Check if token is expired or about to expire (within 5 minutes)
    if time.time() >= expires_at - 300:
        # Token is expired or about to expire, refresh it
        new_token_data = refresh_access_token(refresh_token)
        return new_token_data["access_token"]
    return access_token

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
        return await StravaService.get_token(request.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/strava/refresh", response_model=StravaToken)
async def refresh_token(request: StravaRefreshRequest):
    """Refresh access token."""
    try:
        return await StravaService.refresh_token(request.refresh_token)
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
        return await StravaService.get_activity(activity_id, access_token)
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
        return await StravaService.get_segment(segment_id, access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/terrain/info", response_model=TerrainInfo)
async def get_terrain_info(request: TerrainRequest):
    """Get terrain information."""
    try:
        query = request.to_terrain_query()
        return await TerrainService.get_terrain_info(query)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/segments/{segment_id}/match")
async def match_segment_to_ways(
    segment_id: int,
    polyline: str,
    max_distance: float = 10.0,
    min_confidence: float = 0.7
):
    """
    Match a segment's polyline to OSM ways.
    
    Args:
        segment_id: Strava segment ID (for reference only)
        polyline: Encoded polyline from the segment
        max_distance: Maximum allowed distance between way and segment (meters)
        min_confidence: Minimum confidence score for a match (0-1)
        
    Returns:
        List of matching ways with confidence scores and terrain information
    """
    try:
        # Initialize services
        overpass_client = OverpassClient()
        way_matching_service = WayMatchingService(overpass_client)
        
        # Find matching ways
        matches = await way_matching_service.find_matching_ways(
            polyline,
            max_distance=max_distance,
            min_confidence=min_confidence
        )
        
        # For each match, get terrain information
        for match in matches:
            # Get terrain info for this way
            terrain_info = await get_terrain_info_for_way(match.way_id, polyline)
            match.terrain_info = terrain_info
        
        return matches
        
    except Exception as e:
        logger.error(f"Error matching segment to ways: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error matching segment to ways: {str(e)}"
        )

async def get_terrain_info_for_way(way_id: int, polyline: str) -> dict:
    """Get terrain information for a specific way."""
    try:
        # Decode the polyline to get coordinates
        points = decode(polyline)
        if not points:
            return {}
            
        # Create a bounding box around the points
        min_lat = min(p[0] for p in points) - 0.001
        max_lat = max(p[0] for p in points) + 0.001
        min_lon = min(p[1] for p in points) - 0.001
        max_lon = max(p[1] for p in points) + 0.001
        
        # Query terrain information
        query = TerrainQuery(
            start_lat=min_lat,
            start_lon=min_lon,
            end_lat=max_lat,
            end_lon=max_lon,
            polyline=polyline
        )
        
        return await get_terrain_info(query)
        
    except Exception as e:
        logger.error(f"Error getting terrain info for way {way_id}: {str(e)}")
        return {}

@app.get("/api/auth/callback")
async def strava_callback(code: str):
    try:
        # Exchange authorization code for access token
        response = requests.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code"
            }
        )
        response.raise_for_status()
        token_data = response.json()
        
        # Create URL parameters with the token data
        params = {
            "access_token": token_data["access_token"],
            "refresh_token": token_data["refresh_token"],
            "expires_at": token_data["expires_at"]
        }
        
        # Redirect to frontend with token data
        return RedirectResponse(f"{FRONTEND_URL}/auth/success?{urlencode(params)}")
    except requests.exceptions.RequestException as e:
        # Redirect to frontend with error
        return RedirectResponse(f"{FRONTEND_URL}/auth/error?error={str(e)}")

@app.get("/api/activities")
async def get_activities(access_token: str, refresh_token: str, expires_at: int):
    """Get list of activities with basic information only."""
    try:
        # Get a valid access token
        valid_token = get_valid_token(access_token, refresh_token, expires_at)
        
        headers = {"Authorization": f"Bearer {valid_token}"}
        response = requests.get(
            f"{STRAVA_API_URL}/athlete/activities",
            headers=headers,
            params={
                "per_page": 30,  # Limit to 30 activities for performance
                "fields": "id,name,type,distance,moving_time,elapsed_time,start_date,map"  # Only fetch needed fields
            }
        )
        response.raise_for_status()
        activities = response.json()
        
        # Transform to include only necessary data
        simplified_activities = [{
            "id": activity["id"],
            "name": activity["name"],
            "type": activity["type"],
            "distance": activity["distance"],
            "moving_time": activity["moving_time"],
            "elapsed_time": activity["elapsed_time"],
            "start_date": activity["start_date"],
            "has_map": bool(activity.get("map", {}).get("polyline"))
        } for activity in activities]
        
        return simplified_activities
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching activities: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/activities/{activity_id}")
async def get_activity_details(
    activity_id: int,
    access_token: str,
    refresh_token: str,
    expires_at: int
):
    """Get detailed information for a specific activity including segments."""
    try:
        # Get a valid access token
        valid_token = get_valid_token(access_token, refresh_token, expires_at)
        
        headers = {"Authorization": f"Bearer {valid_token}"}
        response = requests.get(
            f"{STRAVA_API_URL}/activities/{activity_id}",
            headers=headers,
            params={"include_all_efforts": "true"}  # Include all segment efforts
        )
        response.raise_for_status()
        activity = response.json()

        logger.info(f"Fetched activity details for activity {activity_id}")
        
        # Extract relevant data including segments
        activity_details = {
            "id": activity["id"],
            "name": activity["name"],
            "type": activity["type"],
            "distance": activity["distance"],
            "moving_time": activity["moving_time"],
            "elapsed_time": activity["elapsed_time"],
            "start_date": activity["start_date"],
            "map": activity.get("map", {}),
            "segments": [
                {
                    "id": effort["segment"]["id"],
                    "name": effort["segment"]["name"],
                    # "polyline": effort["segment"].get("map", {}).get("polyline"),
                    "distance": effort["segment"]["distance"],
                    "elevation_gain": effort["segment"].get("elevation_gain", 0),
                    "average_grade": effort["segment"].get("average_grade", 0),
                    "effort": {
                        "id": effort["id"],
                        "elapsed_time": effort["elapsed_time"],
                        "moving_time": effort["moving_time"],
                        "start_date": effort["start_date"]
                    }
                }
                for effort in activity.get("segment_efforts", [])
                # if effort["segment"].get("map", {}).get("polyline")  # Only include segments with polylines
            ]
        }
        
        return activity_details
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching activity details: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/activities/download")
async def download_activities(access_token: str, refresh_token: str, expires_at: int):
    try:
        # Get a valid access token
        valid_token = get_valid_token(access_token, refresh_token, expires_at)
        
        headers = {"Authorization": f"Bearer {valid_token}"}
        response = requests.get(
            f"{STRAVA_API_URL}/athlete/activities",
            headers=headers
        )
        response.raise_for_status()
        activities = response.json()
        
        # Create a JSON response with the activities
        return JSONResponse(
            content=activities,
            headers={
                "Content-Disposition": "attachment; filename=strava_activities.json"
            }
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/terrain")
async def get_terrain_info(query: TerrainQuery):
    try:
        logger.info(f"Processing terrain query: {query}")
        
        # Create a bounding box around the segment with some padding
        min_lat = min(query.start_lat, query.end_lat) - 0.001
        max_lat = max(query.start_lat, query.end_lat) + 0.001
        min_lon = min(query.start_lon, query.end_lon) - 0.001
        max_lon = max(query.start_lon, query.end_lon) + 0.001

        logger.info(f"Query bounding box: ({min_lat}, {min_lon}) to ({max_lat}, {max_lon})")

        # Construct Overpass QL query
        overpass_query = f"""
        [out:json][timeout:25];
        (
          // Get surface types
          way["surface"]({min_lat},{min_lon},{max_lat},{max_lon});
          // Get track types
          way["tracktype"]({min_lat},{min_lon},{max_lat},{max_lon});
          // Get highway types
          way["highway"]({min_lat},{min_lon},{max_lat},{max_lon});
        );
        out body;
        >;
        out skel qt;
        """

        # Make request to Overpass API
        response = requests.post(
            OVERPASS_API_URL,
            data=overpass_query,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        response.raise_for_status()
        
        # Process the response
        data = response.json()
        elements = data.get('elements', [])
        logger.info(f"Received {len(elements)} elements from Overpass API")
        
        terrain_info = {
            'surfaces': set(),
            'tracktypes': set(),
            'highways': set(),
            'surface_distances': {}  # Track distance for each surface type
        }

        # If we have polyline data, decode it for path matching
        segment_points = []
        if query.polyline:
            segment_points = decode(query.polyline)
            logger.info(f"Decoded polyline into {len(segment_points)} points")

        # Extract terrain information from the response
        for element in elements:
            if element.get('type') == 'way':
                logger.info(f"Processing way element: {element.get('id')} with tags: {element.get('tags', {})}")
                
                # Get the nodes of this way
                way_nodes = []
                for node in elements:
                    if node.get('type') == 'node' and node.get('id') in element.get('nodes', []):
                        way_nodes.append((node.get('lat'), node.get('lon')))

                logger.info(f"Found {len(way_nodes)} nodes for way {element.get('id')}")

                # If we have segment points, check if this way is close to the segment
                if segment_points and way_nodes:
                    # Calculate the distance of overlap between the way and the segment
                    overlap_distance = 0
                    for i in range(len(segment_points) - 1):
                        seg_start = segment_points[i]
                        seg_end = segment_points[i + 1]
                        
                        # Check if this segment part overlaps with any part of the way
                        for j in range(len(way_nodes) - 1):
                            way_start = way_nodes[j]
                            way_end = way_nodes[j + 1]
                            
                            # Check if either end of the way segment is close to the segment
                            start_close = (abs(way_start[0] - seg_start[0]) <= query.distance_threshold and 
                                        abs(way_start[1] - seg_start[1]) <= query.distance_threshold)
                            end_close = (abs(way_end[0] - seg_end[0]) <= query.distance_threshold and 
                                      abs(way_end[1] - seg_end[1]) <= query.distance_threshold)
                            
                            # If either end is close, calculate the distance
                            if start_close or end_close:
                                # Calculate the distance of this way segment
                                R = 6371000  # Earth's radius in meters
                                lat1, lon1 = math.radians(way_start[0]), math.radians(way_start[1])
                                lat2, lon2 = math.radians(way_end[0]), math.radians(way_end[1])
                                dlat = lat2 - lat1
                                dlon = lon2 - lon1
                                a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
                                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                                distance = R * c
                                
                                # If both ends are close, use the full distance
                                # If only one end is close, use half the distance
                                if start_close and end_close:
                                    overlap_distance += distance
                                else:
                                    overlap_distance += distance / 2
                                
                                logger.info(f"Found overlap: way segment {j} to {j+1} with segment part {i} to {i+1}")
                                logger.info(f"Way points: {way_start} to {way_end}")
                                logger.info(f"Segment points: {seg_start} to {seg_end}")
                                logger.info(f"Distance added: {distance}m")

                    logger.info(f"Calculated total overlap distance for way {element.get('id')}: {overlap_distance}m")

                    # Only include terrain data if there's significant overlap
                    if overlap_distance > 0:
                        tags = element.get('tags', {})
                        if 'surface' in tags:
                            surface = tags['surface']
                            terrain_info['surfaces'].add(surface)
                            terrain_info['surface_distances'][surface] = terrain_info['surface_distances'].get(surface, 0) + overlap_distance
                            logger.info(f"Added surface {surface} with distance {overlap_distance}m")
                        if 'tracktype' in tags:
                            terrain_info['tracktypes'].add(tags['tracktype'])
                            logger.info(f"Added tracktype {tags['tracktype']}")
                        if 'highway' in tags:
                            terrain_info['highways'].add(tags['highway'])
                            logger.info(f"Added highway {tags['highway']}")

        # Calculate total distance and natural surface percentage
        total_distance = sum(terrain_info['surface_distances'].values())
        natural_surfaces = ['gravel', 'wood', 'unpaved', 'dirt', 'ground', 'grass', 'sand', 'earth']
        natural_distance = sum(
            distance for surface, distance in terrain_info['surface_distances'].items()
            if any(natural in surface.lower() for natural in natural_surfaces)
        )
        natural_percentage = (natural_distance / total_distance * 100) if total_distance > 0 else 0

        logger.info(f"Total distance: {total_distance}m")
        logger.info(f"Natural distance: {natural_distance}m")
        logger.info(f"Natural percentage: {natural_percentage}%")
        logger.info(f"Surface distances: {terrain_info['surface_distances']}")

        # Convert sets to lists for JSON serialization
        result = {
            'surfaces': list(terrain_info['surfaces']),
            'tracktypes': list(terrain_info['tracktypes']),
            'highways': list(terrain_info['highways']),
            'surface_distances': terrain_info['surface_distances'],
            'natural_percentage': round(natural_percentage, 1)
        }
        
        logger.info(f"Returning result: {result}")
        return result

    except requests.exceptions.RequestException as e:
        logger.error(f"Error querying Overpass API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to query terrain information: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in get_terrain_info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/api/segment/{segment_id}")
async def get_segment_details(segment_id: int, access_token: str, refresh_token: str, expires_at: int):
    try:
        # Get a valid access token
        valid_token = get_valid_token(access_token, refresh_token, expires_at)
        
        headers = {"Authorization": f"Bearer {valid_token}"}
        response = requests.get(
            f"{STRAVA_API_URL}/segments/{segment_id}",
            headers=headers
        )
        response.raise_for_status()
        segment_data = response.json()
        
        logger.info(f"Fetched detailed segment data for segment {segment_id}")
        return segment_data
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching segment details: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 