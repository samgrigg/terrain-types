from typing import Optional, List
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
    distance: float = 0.0
    average_grade: float = 0.0
    map: Optional[StravaMap] = None
    start_latlng: Optional[List[float]] = None
    end_latlng: Optional[List[float]] = None

class StravaSegmentEffort(BaseModel):
    """Model for Strava segment effort data."""
    segment: StravaSegment
    id: Optional[int] = None
    elapsed_time: Optional[int] = None
    moving_time: Optional[int] = None
    start_date: Optional[str] = None
    start_index: int = 0
    end_index: int = 0

class StravaActivity(BaseModel):
    """Model for Strava activity data."""
    id: int
    name: str
    type: Optional[str] = None
    distance: float = 0.0
    moving_time: int = 0
    elapsed_time: int = 0
    start_date: Optional[str] = None
    map: Optional[StravaMap] = None
    segment_efforts: List[StravaSegmentEffort] = Field(default_factory=list)

class StravaAuthRequest(BaseModel):
    """Model for Strava authentication request."""
    code: str

class StravaRefreshRequest(BaseModel):
    """Model for Strava token refresh request."""
    refresh_token: str 
