from typing import Dict, Optional
import aiohttp
import os

class StravaClient:
    """Client for the Strava API."""

    def __init__(self):
        """Initialize the client with Strava API credentials."""
        self.client_id = os.getenv('STRAVA_CLIENT_ID')
        self.client_secret = os.getenv('STRAVA_CLIENT_SECRET')
        self.base_url = "https://www.strava.com/api/v3"

    async def exchange_code_for_token(self, code: str) -> Dict:
        """Exchange authorization code for access token."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    "https://www.strava.com/oauth/token",
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "code": code,
                        "grant_type": "authorization_code"
                    }
                ) as response:
                    if response.status != 200:
                        raise Exception(f"Strava API error: {response.status}")
                    return await response.json()
            except Exception as e:
                print(f"Error exchanging code for token: {str(e)}")
                raise

    async def refresh_access_token(self, refresh_token: str) -> Dict:
        """Refresh access token using refresh token."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    "https://www.strava.com/oauth/token",
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token"
                    }
                ) as response:
                    if response.status != 200:
                        raise Exception(f"Strava API error: {response.status}")
                    return await response.json()
            except Exception as e:
                print(f"Error refreshing access token: {str(e)}")
                raise

    async def get_activity(self, activity_id: int, access_token: str) -> Dict:
        """Get activity details."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    f"{self.base_url}/activities/{activity_id}",
                    headers={"Authorization": f"Bearer {access_token}"}
                ) as response:
                    if response.status != 200:
                        raise Exception(f"Strava API error: {response.status}")
                    return await response.json()
            except Exception as e:
                print(f"Error getting activity details: {str(e)}")
                raise

    async def get_segment(self, segment_id: int, access_token: str) -> Dict:
        """Get segment details."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    f"{self.base_url}/segments/{segment_id}",
                    headers={"Authorization": f"Bearer {access_token}"}
                ) as response:
                    if response.status != 200:
                        raise Exception(f"Strava API error: {response.status}")
                    return await response.json()
            except Exception as e:
                print(f"Error getting segment details: {str(e)}")
                raise 