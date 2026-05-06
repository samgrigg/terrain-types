# Terrain detail table & streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the brainstormed **detail experience**: a primary **terrain-run breakdown table** (contiguous paved / dirt / unknown rows with miles, overlapping Strava segment names, average grade when streams exist, row stripe colors), backed by a **minimal Strava streams proxy** and **pure helpers** covered by tests—without regressing the existing feed, responsive layout, or PWA shell.

**Architecture:** The UI already loads **activity detail** (polyline + Strava `segments` efforts) and **terrain** (`runs` from `POST /api/terrain`). This plan adds (1) a **streams JSON proxy** on the backend using the same query-token pattern as other `/api/*` routes, (2) **client-side** enrichment: merge `runs` with segment-effort index ranges for names, compute **average grade** per run by aligning stream `distance`/`altitude` to cumulative distance along the decoded detail polyline, (3) a **`TerrainRunsTable`** component and composition inside the detail panel **above** the existing map/summary (map stays for spatial context; table is the spec’d breakdown). Strava scopes stay **minimal** (`read,activity:read` until proven insufficient); any streams denial yields **“—”** for grade.

**Tech Stack:** FastAPI (`backend/main.py`), `TerrainService` / `TerrainInfo.runs`, React 18 + MUI 5, Axios, `@mapbox/polyline`, Jest (frontend), pytest + httpx (backend).

---

## File map (created / modified)

| Area | File | Responsibility |
|------|------|------------------|
| Backend | `backend/main.py` | New `GET /api/activities/{activity_id}/streams` delegating to Strava streams API with query-token auth |
| Backend | `backend/test_api.py` | Update list payload expectation for `summary_polyline`; add streams route test; add `/api/athlete` smoke test |
| Backend | `backend/test_terrain.py` | Assert `runs` buckets + contiguity on mocked ways |
| Frontend | `frontend/src/utils/segmentNames.js` | Given Strava-normalized `segments` + one run index range → comma-separated unique names |
| Frontend | `frontend/src/utils/__tests__/segmentNames.test.js` | Jest coverage for overlap / ordering |
| Frontend | `frontend/src/utils/streamGrade.js` | Cumulative distance along decoded polyline; altitude interpolation; grade % per run |
| Frontend | `frontend/src/utils/__tests__/streamGrade.test.js` | Jest coverage with synthetic streams |
| Frontend | `frontend/src/components/TerrainRunsTable.js` | MUI table: stripe color, mi, names, grade, type |
| Frontend | `frontend/src/components/ActivityMap.js` | Slim layout: render `TerrainRunsTable` when `runs`+activity passed, or lift table to parent—**one** clear owner for table props |
| Frontend | `frontend/src/App.js` | Pass streams fetch into detail child or co-locate detail data loading |
| Docs | `DEPLOYMENT.md` | Note HTTPS + service worker for installability (if not already) |

---

### Task 1: Fix activities list API test for `summary_polyline`

**Files:**
- Modify: `backend/test_api.py` (`test_get_activities_returns_simplified_payload`)

- [ ] **Step 1: Write failing assertion**

In `test_get_activities_returns_simplified_payload`, extend the expected JSON item to include the field the API now returns:

```python
"summary_polyline": "abc",
```

placed alongside `"has_map": True`.

- [ ] **Step 2: Run test — expect FAIL until expectation matches implementation**

Run:

```bash
cd backend && pytest test_api.py::test_get_activities_returns_simplified_payload -v
```

Expected before fix: FAIL (dict mismatch). After updating expected payload: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/test_api.py
git commit -m "test(api): expect summary_polyline on activities list"
```

---

### Task 2: Backend tests — `TerrainInfo.runs` buckets and contiguity

**Files:**
- Modify: `backend/test_terrain.py`

- [ ] **Step 1: Add failing test for non-empty `runs`**

Append:

```python
@pytest.mark.anyio
async def test_terrain_service_returns_runs_matching_surface_buckets():
    overpass_client = AsyncMock()
    overpass_client.query_ways.return_value = [
        build_way(
            1,
            {"highway": "track", "surface": "gravel", "tracktype": "grade2"},
            ROUTE_POINTS,
        ),
    ]
    service = TerrainService(overpass_client)
    query = TerrainQuery(
        start_lat=ROUTE_POINTS[0][0],
        start_lon=ROUTE_POINTS[0][1],
        end_lat=ROUTE_POINTS[-1][0],
        end_lon=ROUTE_POINTS[-1][1],
        polyline=polyline.encode(ROUTE_POINTS),
        distance_threshold=25.0,
    )

    result = await service.get_terrain_info(query)

    assert result.runs, "runs must be non-empty for a matched polyline"
    assert all(r.bucket in ("paved", "dirt", "unknown") for r in result.runs)
    assert result.runs[0].start_index == 0
    assert result.runs[-1].end_index == len(ROUTE_POINTS) - 1
    # Single bucket along this short synthetic route → one run
    assert len(result.runs) == 1
    assert result.runs[0].bucket == "dirt"
```

- [ ] **Step 2: Run test**

```bash
cd backend && pytest test_terrain.py::test_terrain_service_returns_runs_matching_surface_buckets -v
```

Expected: PASS (implementation already emits `runs`). If FAIL, fix `TerrainService` merge logic before proceeding.

- [ ] **Step 3: Commit**

```bash
git add backend/test_terrain.py
git commit -m "test(terrain): cover TerrainInfo.runs buckets and span"
```

---

### Task 3: Strava streams proxy — route + API test

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/test_api.py`

- [ ] **Step 1: Write failing API test**

Add to `backend/test_api.py`:

```python
@pytest.mark.anyio
async def test_get_activity_streams_proxies_strava(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "_fetch_strava_resource",
        lambda path, access_token, params=None: {"distance": {"data": [0, 10]}, "altitude": {"data": [100, 110]}},
    )

    response = await client.get(
        "/api/activities/42/streams",
        params={
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_at": "9999999999",
            "keys": "distance,altitude",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["distance"]["data"] == [0, 10]
    assert body["altitude"]["data"] == [100, 110]
```

Run:

```bash
cd backend && pytest test_api.py::test_get_activity_streams_proxies_strava -v
```

Expected: FAIL — route missing.

- [ ] **Step 2: Implement route in `main.py`**

Add:

```python
@app.get("/api/activities/{activity_id}/streams")
async def get_activity_streams(
    activity_id: int,
    access_token: str,
    refresh_token: str,
    expires_at: int,
    keys: str = "distance,altitude",
) -> Dict[str, Any]:
    valid_token = get_valid_token(access_token, refresh_token, expires_at)
    return _fetch_strava_resource(
        f"/activities/{activity_id}/streams",
        valid_token,
        params={"keys": keys, "key_by_type": "true"},
    )
```

Adjustonly if Strava’s live response shape differs from tests—keep handler thin (proxy only).

- [ ] **Step 3: Run test — PASS**

```bash
cd backend && pytest test_api.py::test_get_activity_streams_proxies_strava -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/test_api.py
git commit -m "feat(api): proxy Strava activity streams for grade computation"
```

---

### Task 4: `segmentNames` helper + Jest tests

**Files:**
- Create: `frontend/src/utils/segmentNames.js`
- Create: `frontend/src/utils/__tests__/segmentNames.test.js`

- [ ] **Step 1: Write failing Jest test**

`frontend/src/utils/__tests__/segmentNames.test.js`:

```javascript
import { segmentNamesForRun } from '../segmentNames';

describe('segmentNamesForRun', () => {
  it('returns overlapping Strava segment names sorted by start_index', () => {
    const segments = [
      { start_index: 0, end_index: 5, segment: { id: 1, name: 'Alpha' } },
      { start_index: 4, end_index: 10, segment: { id: 2, name: 'Beta' } },
      { start_index: 20, end_index: 30, segment: { id: 3, name: 'Gamma' } },
    ];
    const run = { start_index: 3, end_index: 8 };
    expect(segmentNamesForRun(segments, run)).toBe('Alpha, Beta');
  });

  it('returns em dash when no overlap', () => {
    expect(segmentNamesForRun([], { start_index: 0, end_index: 3 })).toBe('—');
  });
});
```

Run:

```bash
cd frontend && CI=true npm test -- --watchAll=false segmentNames.test.js
```

Expected: FAIL — module missing.

- [ ] **Step 2: Implement `segmentNames.js`**

```javascript
function overlaps(aStart, aEnd, bStart, bEnd) {
  return !(aEnd < bStart || aStart > bEnd);
}

export function segmentNamesForRun(activitySegments, run) {
  if (!activitySegments?.length || run == null) {
    return '—';
  }
  const { start_index: rs, end_index: re } = run;
  const names = [];
  const seen = new Set();
  const sorted = [...activitySegments].sort((x, y) => x.start_index - y.start_index);
  sorted.forEach((effort) => {
    const ss = effort.start_index;
    const se = effort.end_index;
    const name = effort.segment?.name;
    if (!name || overlaps(rs, re, ss, se) === false) {
      return;
    }
    const key = `${effort.segment.id}:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  });
  return names.length ? names.join(', ') : '—';
}
```

- [ ] **Step 3: Run Jest — PASS**

```bash
cd frontend && CI=true npm test -- --watchAll=false segmentNames.test.js
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/segmentNames.js frontend/src/utils/__tests__/segmentNames.test.js
git commit -m "feat(frontend): segment name overlap helper for terrain runs"
```

---

### Task 5: `streamGrade` helper + Jest tests

**Files:**
- Create: `frontend/src/utils/streamGrade.js`
- Create: `frontend/src/utils/__tests__/streamGrade.test.js`

- [ ] **Step 1: Write failing tests**

Use synthetic streams where `distance` and `altitude` arrays align 1:1. Example expectation: linear climb 0→100 m distance, 0→10 m altitude ⇒ ~10% average grade over full range.

```javascript
import { averageGradePercentForRun } from '../streamGrade';

describe('averageGradePercentForRun', () => {
  it('computes grade from streams and polyline cumulative mapping', () => {
    const points = [
      [0, 0],
      [0.0009, 0],
    ]; // two points — distances computed internally
    const streams = {
      distance: { data: [0, 50, 100] },
      altitude: { data: [100, 105, 110] },
    };
    const run = { start_index: 0, end_index: 1 };
    const g = averageGradePercentForRun(points, streams, run);
    expect(g).not.toBeNull();
    expect(g).toBeGreaterThan(0);
  });

  it('returns null when altitude missing', () => {
    const points = [[0, 0], [1, 1]];
    const streams = { distance: { data: [0, 1000] } };
    expect(averageGradePercentForRun(points, streams, { start_index: 0, end_index: 1 })).toBeNull();
  });
});
```

Run tests → FAIL.

- [ ] **Step 2: Implement `streamGrade.js`**

Implementation sketch (engineer fills exact haversine import or reuse map utils):

1. Build `vertexDistances[]` length `n` where `vertexDistances[i]` is cumulative meters along polyline from vertex 0 to vertex `i`.
2. Map run `(start_index, end_index)` to distances `dStart = vertexDistances[start_index]`, `dEnd = vertexDistances[end_index]`.
3. In stream arrays, find indices `i0`, `i1` bracketing `dStart`/`dEnd` via linear scan on `streams.distance.data`.
4. Linear-interpolate altitude at `dStart` and `dEnd`.
5. `grade = (altEnd - altStart) / max(dEnd - dStart, 1e-6) * 100`.

Export:

```javascript
export function averageGradePercentForRun(decodedPolylinePoints, streams, run) { ... }
```

- [ ] **Step 3: Jest PASS**

```bash
cd frontend && CI=true npm test -- --watchAll=false streamGrade.test.js
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/streamGrade.js frontend/src/utils/__tests__/streamGrade.test.js
git commit -m "feat(frontend): average grade per terrain run from Strava streams"
```

---

### Task 6: `TerrainRunsTable` UI component

**Files:**
- Create: `frontend/src/components/TerrainRunsTable.js`

- [ ] **Step 1: Implement presentational component**

Props:

```javascript
/**
 * @param {{ start_index: number, end_index: number, bucket: 'paved'|'dirt'|'unknown', distance_m: number }[]} runs
 * @param {(run: object) => string} segmentNamesForRun - pre-bound or callback
 * @param {(run: object) => string|null} gradeForRun - returns formatted percent string or null → display "—"
 */
```

Requirements:

- Strip / row leading color bar: `paved` `#787878`, `dirt` `#C4822A`, `unknown` `#B5B5B5`.
- Miles column: `distance_m / 1609.344` to one decimal.
- Type column: capitalized bucket label.
- Use MUI `TableContainer`, `Table`, sticky header optional on mobile.

No fetch inside component — parent supplies data.

- [ ] **Step 2: Manual smoke**

Run app, inject dummy props via Storybook **or** temporary render in `App.js` — **remove** temp hook before commit. Prefer adding one RTL test optional Task 6b if timeboxed:

```bash
cd frontend && CI=true npm test -- --watchAll=false TerrainRunsTable.test.js
```

(Optional file `TerrainRunsTable.test.js` — only if engineer adds RTL.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TerrainRunsTable.js
git commit -m "feat(ui): terrain runs breakdown table"
```

---

### Task 7: Wire detail data flow — fetch terrain + streams; render table

**Files:**
- Modify: `frontend/src/App.js` **or** `frontend/src/components/ActivityMap.js` (pick **one** owner; prefer `ActivityMap.js` so `App.js` stays routing/layout-only)

Recommended: extend `ActivityMap.js`:

1. After activity loads (full detail with `map.polyline`), call existing `getTerrainData` (already used for aggregate). Read `terrain.runs`.
2. `useEffect` fetch `/api/activities/{id}/streams` with axios + same localStorage tokens pattern as `App.js` (`access_token`, `refresh_token`, `expires_at` query params). On 4xx/empty, set `streams` `null`.
3. Decode polyline once via `decode(activity.map.polyline)`.
4. For each run, `segmentNamesForRun(activity.segments || [], run)` and `averageGradePercentForRun(points, streams, run)` → format `"2.1%"` one decimal.

Edge cases:

- No polyline (trainer): show empty state copy already spec’d during brainstorming.
- `runs` empty: show single-row message “Terrain breakdown unavailable”.

- [ ] **Step 1: Implement wiring + loading skeleton**

While streams or terrain loading for **table**, show `CircularProgress` **only in table card** — do not block Leaflet map mount.

- [ ] **Step 2: Production build**

```bash
cd frontend && npm run build
```

Expected: success, no eslint errors introduced.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ActivityMap.js
git commit -m "feat(activity): terrain runs table with streams-backed grades"
```

---

### Task 8: Deployment note — PWA installability

**Files:**
- Modify: `DEPLOYMENT.md` (short subsection)

- [ ] **Step 1: Document HTTPS requirement**

Add 3–5 sentences: service worker + manifest require HTTPS (localhost exempt); users must visit once before “Add to Home Screen”; caching limitations.

- [ ] **Step 2: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "docs: PWA install notes for HTTPS and SW"
```

---

## Self-review (plan quality)

**1. Spec coverage**

| Brainstorm requirement | Task(s) |
|------------------------|---------|
| Detail table by contiguous paved/dirt/unknown | Task 6–7 (`runs` already from API) |
| Miles, segment names, grade, terrain type, row colors | Task 4, 5, 6 |
| Grade = average; streams minimal scopes; “—” on failure | Task 3, 5, 7 |
| Async detail + spinner | Already in `App.js` (`detailLoading`); Task 7 narrows spinner scope to table |
| Mobile slide / desktop split / PWA | Already shipped; Task 8 docs only |
| Feed colored SVG / dirt miles | Already shipped |

**2. Placeholder scan**

No TBD/TODO lines intentionally included.

**3. Type consistency**

- Strava list uses `summary_polyline`; detail uses `map.polyline` — table + grade use **detail** polyline only (matches Strava indices on `segment_efforts`).

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-terrain-detail-table-streams.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach do you want?**
