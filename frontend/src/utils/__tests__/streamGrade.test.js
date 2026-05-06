import { averageGradePercentForRun } from '../streamGrade';

describe('averageGradePercentForRun', () => {
  it('computes grade from streams and polyline cumulative mapping', () => {
    const points = [
      [0, 0],
      [0.0009, 0],
    ];
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
