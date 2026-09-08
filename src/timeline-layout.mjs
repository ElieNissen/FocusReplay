export function placeLabels(segments, width, offset = 0, viewport = width) {
  const ends = [];
  const items = segments
    .filter((a) => a.x + a.width >= offset && a.x <= offset + viewport)
    .map((a) => {
      const labelWidth = Math.min(width, Math.max(115, a.app.length * 7 + 58));
      if (a.width >= labelWidth) return { ...a, callout: false };
      const labelX = Math.max(0, Math.min(width - labelWidth, a.x));
      let row = ends.findIndex((end) => end + 8 <= labelX);
      if (row < 0) row = ends.length;
      ends[row] = labelX + labelWidth;
      return { ...a, callout: true, labelX, labelWidth, row };
    });
  return { items, rows: ends.length };
}
