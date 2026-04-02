from typing import List, Optional
from ..models.strava import (
    StravaToken,
    StravaActivity,
    StravaSegment,
    StravaSegmentEffort
)

class StravaService:
    """Service for Strava API operations."""

    def __init__(self, strava_client):
        """Initialize the service with a Strava API client."""
        self.strava_client = strava_client

    async def get_token(self, code: str) -> StravaToken:
        """Exchange authorization code for access token."""
        try:
            response = await self.strava_client.exchange_code_for_token(code)
            return StravaToken(**response)
        except Exception as e:
            print(f"Error getting Strava token: {str(e)}")
            raise

    async def refresh_token(self, refresh_token: str) -> StravaToken:
        """Refresh access token using refresh token."""
        try:
            response = await self.strava_client.refresh_access_token(refresh_token)
            return StravaToken(**response)
        except Exception as e:
            print(f"Error refreshing Strava token: {str(e)}")
            raise

    async def get_activity(self, activity_id: int, access_token: str) -> StravaActivity:
        """Get activity details."""
        try:
            response = await self.strava_client.get_activity(activity_id, access_token)
            return StravaActivity(**response)
        except Exception as e:
            print(f"Error getting activity details: {str(e)}")
            raise

    async def get_segment(self, segment_id: int, access_token: str) -> StravaSegment:
        """Get segment details."""
        try:
            response = await self.strava_client.get_segment(segment_id, access_token)
            return StravaSegment(**response)
        except Exception as e:
            print(f"Error getting segment details: {str(e)}")
            raise

    async def get_activity_segments(
        self,
        activity_id: int,
        access_token: str
    ) -> List[StravaSegmentEffort]:
        """Get segments from an activity."""
        try:
            activity = await self.get_activity(activity_id, access_token)
            return activity.segment_efforts
        except Exception as e:
            print(f"Error getting activity segments: {str(e)}")
            raise

    async def get_segment_details(
        self,
        segment_id: int,
        access_token: str
    ) -> Optional[StravaSegment]:
        """Get detailed segment information."""
        try:
            return await self.get_segment(segment_id, access_token)
        except Exception as e:
            print(f"Error getting segment details: {str(e)}")
            return None 
