from typing import List, Dict, Optional
from pydantic import BaseModel

class OSMNode(BaseModel):
    """Model for OSM node."""
    id: int
    lat: float
    lon: float

class OSMWay(BaseModel):
    """Model for OSM way."""
    id: int
    nodes: List[OSMNode]
    tags: Dict[str, str]
    match_score: Optional[float] = None  # Score indicating how well this way matches the segment

class WayMatchResult(BaseModel):
    """Model for way matching result."""
    way: OSMWay
    match_score: float
    match_type: str  # e.g., "exact", "partial", "reverse"
    distance: float  # Total distance between way and segment
    confidence: float  # Confidence score (0-1) 