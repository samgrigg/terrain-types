from fastapi import FastAPI, HTTPException, Depends, Request
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

class StravaToken(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int

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
    try:
        # Get a valid access token
        valid_token = get_valid_token(access_token, refresh_token, expires_at)
        
        headers = {"Authorization": f"Bearer {valid_token}"}
        response = requests.get(
            f"{STRAVA_API_URL}/athlete/activities",
            headers=headers,
            params={"per_page": 30}  # Limit to 30 activities for performance
        )
        response.raise_for_status()
        activities = response.json()
        
        # Fetch detailed activity data including map for each activity
        for activity in activities:
            logger.info(f"Fetching details for activity {activity['id']}")
            detail_response = requests.get(
                f"{STRAVA_API_URL}/activities/{activity['id']}",
                headers=headers
            )
            if detail_response.status_code == 200:
                detail_data = detail_response.json()
                activity["map"] = detail_data.get("map", {})
                
                # Log detailed information about the activity
                logger.info(f"Activity {activity['id']} details:")
                logger.info(f"  Name: {activity['name']}")
                logger.info(f"  Type: {activity['type']}")
                logger.info(f"  Start Date: {activity['start_date']}")
                logger.info(f"  Manual: {activity.get('manual', False)}")
                logger.info(f"  Trainer: {activity.get('trainer', False)}")
                logger.info(f"  Has Map: {'map' in detail_data}")
                logger.info(f"  Has Polyline: {'polyline' in detail_data.get('map', {})}")
                logger.info(f"  Has Summary Polyline: {'summary_polyline' in detail_data.get('map', {})}")
                
                if not detail_data.get('map', {}).get('polyline'):
                    logger.warning(f"Activity {activity['id']} is missing polyline data")
            else:
                logger.error(f"Failed to fetch details for activity {activity['id']}: {detail_response.status_code}")
        
        return activities
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching activities: {str(e)}")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 