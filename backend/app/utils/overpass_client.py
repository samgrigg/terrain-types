from typing import List, Dict, Any
import aiohttp
import json
from ..config import settings

class OverpassClient:
    """Client for interacting with the Overpass API."""

    def __init__(self, base_url: str = settings.OVERPASS_API_URL):
        """Initialize the client with the Overpass API URL."""
        self.base_url = base_url

    async def query_ways(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float
    ) -> List[Dict[str, Any]]:
        """
        Query OSM ways within a bounding box.
        
        Args:
            min_lat: Minimum latitude
            min_lon: Minimum longitude
            max_lat: Maximum latitude
            max_lon: Maximum longitude
            
        Returns:
            List of ways with their nodes and tags
        """
        # Query for ways and their nodes
        query = f"""
        [out:json][timeout:25];
        (
          way({min_lat},{min_lon},{max_lat},{max_lon})[highway];
          >;
        );
        out body;
        """
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.base_url,
                data={'data': query}
            ) as response:
                if response.status != 200:
                    raise Exception(f"Overpass API error: {response.status}")
                
                data = await response.json()
                
                # Process the response
                ways = []
                nodes = {node['id']: node for node in data['elements'] if node['type'] == 'node'}
                
                for element in data['elements']:
                    if element['type'] == 'way':
                        way = {
                            'id': element['id'],
                            'tags': element.get('tags', {}),
                            'nodes': [
                                {
                                    'id': node_id,
                                    'lat': nodes[node_id]['lat'],
                                    'lon': nodes[node_id]['lon']
                                }
                                for node_id in element.get('nodes', [])
                                if node_id in nodes
                            ]
                        }
                        ways.append(way)
                
                return ways

    async def query_terrain(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float
    ) -> List[Dict[str, Any]]:
        """
        Query terrain information within a bounding box.
        
        Args:
            min_lat: Minimum latitude
            min_lon: Minimum longitude
            max_lat: Maximum latitude
            max_lon: Maximum longitude
            
        Returns:
            List of terrain features with their properties
        """
        # Query for surface information
        query = f"""
        [out:json][timeout:25];
        (
          way({min_lat},{min_lon},{max_lat},{max_lon})[surface];
          >;
        );
        out body;
        """
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.base_url,
                data={'data': query}
            ) as response:
                if response.status != 200:
                    raise Exception(f"Overpass API error: {response.status}")
                
                data = await response.json()
                
                # Process the response
                features = []
                nodes = {node['id']: node for node in data['elements'] if node['type'] == 'node'}
                
                for element in data['elements']:
                    if element['type'] == 'way' and 'surface' in element.get('tags', {}):
                        # Get coordinates for the way
                        coords = [
                            [nodes[node_id]['lon'], nodes[node_id]['lat']]
                            for node_id in element.get('nodes', [])
                            if node_id in nodes
                        ]
                        
                        if len(coords) >= 2:  # Need at least 2 points for a line
                            feature = {
                                'type': 'Feature',
                                'geometry': {
                                    'type': 'LineString',
                                    'coordinates': coords
                                },
                                'properties': {
                                    'surface': element['tags']['surface'],
                                    'highway': element['tags'].get('highway'),
                                    'id': element['id']
                                }
                            }
                            features.append(feature)
                
                return features

    def _process_response(self, data: Dict) -> List[Dict]:
        """Process the Overpass API response."""
        if not data.get('elements'):
            return []

        # Create a map of node IDs to their coordinates
        nodes = {
            element['id']: element
            for element in data['elements']
            if element['type'] == 'node'
        }

        # Process ways and attach node coordinates
        ways = []
        for element in data['elements']:
            if element['type'] == 'way':
                way_nodes = []
                for node_id in element.get('nodes', []):
                    if node_id in nodes:
                        way_nodes.append(nodes[node_id])
                element['nodes'] = way_nodes
                ways.append(element)

        return ways 