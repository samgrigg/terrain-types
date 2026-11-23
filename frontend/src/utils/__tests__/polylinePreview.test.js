import { buildSvgProjection } from '../polylinePreview';

describe('route preview projection', () => {
  it('centers a tall route in the preview', () => {
    const { project } = buildSvgProjection([[40, -105], [41, -105]], 320, 72);
    expect(project([40, -105])[0]).toBeCloseTo(160);
    expect(project([41, -105])[0]).toBeCloseTo(160);
    expect(project([41, -105])[1]).toBeCloseTo(4);
    expect(project([40, -105])[1]).toBeCloseTo(68);
  });

  it('accounts for longitude distances so the route keeps its geographic shape', () => {
    const points = [[59.5, 0], [60.5, 2]];
    const { project } = buildSvgProjection(points, 320, 72);
    const [left, bottom] = project(points[0]);
    const [right, top] = project(points[1]);
    // At 60 degrees latitude, two degrees east is approximately as far as one north.
    expect(right - left).toBeCloseTo(bottom - top);
    expect((left + right) / 2).toBeCloseTo(160);
    expect((top + bottom) / 2).toBeCloseTo(36);
  });

  it('centers horizontal routes and repeated points without invalid coordinates', () => {
    const horizontal = buildSvgProjection([[40, -105], [40, -104]], 320, 72);
    expect(horizontal.project([40, -105])[1]).toBeCloseTo(36);
    const stationary = buildSvgProjection([[40, -105], [40, -105]], 320, 72);
    expect(stationary.project([40, -105])).toEqual([160, 36]);
  });
});
