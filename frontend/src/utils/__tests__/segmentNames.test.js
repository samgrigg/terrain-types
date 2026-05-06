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
