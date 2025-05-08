from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
import requests
import os
from dotenv import load_dotenv
from typing import Optional, List
import json
from urllib.parse import urlencode

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
async def get_activities(access_token: str):
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(
            f"{STRAVA_API_URL}/athlete/activities",
            headers=headers
        )
        response.raise_for_status()
        activities = response.json()
        
        return activities
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/activities/download")
async def download_activities(access_token: str):
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
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