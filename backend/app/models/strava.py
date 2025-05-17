from typing import Optional, List, Dict
from pydantic import BaseModel, Field

class StravaToken(BaseModel):
    """Model for Strava token response."""
    access_token: str
    refresh_token: str
    expires_at: int

class StravaMap(BaseModel):
    """Model for Strava map data."""
    polyline: Optional[str] = None
    summary_polyline: Optional[str] = None

class StravaSegment(BaseModel):
    """Model for Strava segment data."""
    id: int
    name: str
    distance: float
    average_grade: float
    map: StravaMap

class StravaSegmentEffort(BaseModel):
    """Model for Strava segment effort data."""
    segment: StravaSegment
    start_index: int
    end_index: int

class StravaActivity(BaseModel):
    """Model for Strava activity data."""
    id: int
    name: str
    map: StravaMap
    segment_efforts: List[StravaSegmentEffort] = Field(default_factory=list)

class StravaAuthRequest(BaseModel):
    """Model for Strava authentication request."""
    code: str

class StravaRefreshRequest(BaseModel):
    """Model for Strava token refresh request."""
    refresh_token: str 