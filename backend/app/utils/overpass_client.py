import asyncio
import json
import logging
from typing import Any, Dict, List

import aiohttp

from ..config import overpass_endpoints

logger = logging.getLogger(__name__)

# Server-side Overpass timeout (seconds). Public instances often allow up to ~180s.
_OVERPASS_STATEMENT_TIMEOUT = 90
# aiohttp must wait long enough for Overpass to respond.
_HTTP_TOTAL_TIMEOUT = 180.0
_TRANSIENT_STATUSES = frozenset({429, 502, 503, 504})
_PER_ENDPOINT_ATTEMPTS = 2
_BACKOFF_SEC = 1.5


class TransientOverpassError(Exception):
    """Overpass overloaded or timing out; another endpoint or retry may succeed."""

    def __init__(self, status: int, detail: str):
        self.status = status
        super().__init__(detail)


class OverpassClient:
    """Client for interacting with the Overpass API."""

    def __init__(self, endpoints: List[str] | None = None):
        self.endpoints = endpoints or overpass_endpoints()

    async def _post_interpreter(self, url: str, query: str) -> Dict[str, Any]:
        timeout = aiohttp.ClientTimeout(total=_HTTP_TOTAL_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            try:
                async with session.post(url, data={"data": query}) as response:
                    text = await response.text()
            except aiohttp.ClientError as exc:
                raise TransientOverpassError(0, f"Connection error: {exc}") from exc

            if response.status == 200:
                try:
                    return json.loads(text)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"Overpass returned non-JSON (HTTP {response.status}): {text[:300]}"
                    ) from exc

            snippet = text[:500].replace("\n", " ")
            if response.status in _TRANSIENT_STATUSES:
                raise TransientOverpassError(
                    response.status,
                    f"HTTP {response.status}: {snippet or '(empty body)'}",
                )
            raise RuntimeError(f"Overpass API HTTP {response.status}: {snippet or '(empty body)'}")

    async def _post_with_failover(self, query: str) -> Dict[str, Any]:
        last_error: Exception | None = None
        for url in self.endpoints:
            for attempt in range(_PER_ENDPOINT_ATTEMPTS):
                try:
                    data = await self._post_interpreter(url, query)
                    if attempt > 0 or url != self.endpoints[0]:
                        logger.info("Overpass query succeeded via %s", url)
                    return data
                except TransientOverpassError as exc:
                    last_error = exc
                    logger.warning(
                        "Overpass transient error %s on %s (attempt %s/%s): %s",
                        exc.status,
                        url,
                        attempt + 1,
                        _PER_ENDPOINT_ATTEMPTS,
                        exc,
                    )
                    if attempt + 1 < _PER_ENDPOINT_ATTEMPTS:
                        await asyncio.sleep(_BACKOFF_SEC * (attempt + 1))
                    else:
                        break
                except aiohttp.ClientError as exc:
                    last_error = exc
                    logger.warning("Overpass connection error on %s: %s", url, exc)
                    break
        if last_error is not None:
            raise RuntimeError(
                "All Overpass endpoints failed (timeouts or overload). "
                "Try again in a minute or set OVERPASS_API_URL in backend/.env to another instance. "
                f"Last error: {last_error}"
            ) from last_error
        raise RuntimeError("No Overpass endpoints configured")

    @staticmethod
    def _elements_to_ways(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        ways = []
        nodes = {node["id"]: node for node in elements if node.get("type") == "node"}

        for element in elements:
            if element.get("type") != "way":
                continue
            way = {
                "id": element["id"],
                "tags": element.get("tags", {}),
                "nodes": [
                    {
                        "id": node_id,
                        "lat": nodes[node_id]["lat"],
                        "lon": nodes[node_id]["lon"],
                    }
                    for node_id in element.get("nodes", [])
                    if node_id in nodes
                ],
            }
            ways.append(way)

        return ways

    async def query_ways(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
    ) -> List[Dict[str, Any]]:
        query = f"""
        [out:json][timeout:{_OVERPASS_STATEMENT_TIMEOUT}];
        (
          way({min_lat},{min_lon},{max_lat},{max_lon})[highway];
          >;
        );
        out body;
        """

        data = await self._post_with_failover(query)
        remark = data.get("remark")
        if remark:
            logger.warning("Overpass remark: %s", remark)

        elements = data.get("elements") or []
        return self._elements_to_ways(elements)

    async def query_terrain(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
    ) -> List[Dict[str, Any]]:
        query = f"""
        [out:json][timeout:{_OVERPASS_STATEMENT_TIMEOUT}];
        (
          way({min_lat},{min_lon},{max_lat},{max_lon})[surface];
          >;
        );
        out body;
        """

        data = await self._post_with_failover(query)
        elements = data.get("elements") or []
        nodes = {node["id"]: node for node in elements if node.get("type") == "node"}

        features = []
        for element in elements:
            if element.get("type") != "way" or "surface" not in element.get("tags", {}):
                continue
            coords = [
                [nodes[node_id]["lon"], nodes[node_id]["lat"]]
                for node_id in element.get("nodes", [])
                if node_id in nodes
            ]

            if len(coords) >= 2:
                feature = {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "properties": {
                        "surface": element["tags"]["surface"],
                        "highway": element["tags"].get("highway"),
                        "id": element["id"],
                    },
                }
                features.append(feature)

        return features

    def _process_response(self, data: Dict) -> List[Dict]:
        """Process the Overpass API response."""
        if not data.get("elements"):
            return []

        nodes = {
            element["id"]: element
            for element in data["elements"]
            if element["type"] == "node"
        }

        ways = []
        for element in data["elements"]:
            if element["type"] == "way":
                way_nodes = []
                for node_id in element.get("nodes", []):
                    if node_id in nodes:
                        way_nodes.append(nodes[node_id])
                element["nodes"] = way_nodes
                ways.append(element)

        return ways
