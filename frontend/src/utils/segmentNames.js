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
