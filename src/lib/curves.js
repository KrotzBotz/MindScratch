// Helpers for polylines: arrays of [x, y] points.

// A smooth curve through `points` (centripetal Catmull-Rom), returned as a dense polyline.
// Unlike the plain version, it doesn't overshoot where the points are unevenly spaced.
// A point written [x, y, true] is a sharp corner: the curve bends there instead of rounding it.
export function smoothCurve(points, samples = 12) {
  const corner = points.findIndex((p, i) => p[2] && i > 0 && i < points.length - 1);
  if (corner > 0) {
    const [first, rest] = [points.slice(0, corner + 1), points.slice(corner)];
    return [...smoothCurve(first, samples), ...smoothCurve(rest, samples).slice(1)];
  }
  const n = points.length;
  const padded = [reflect(points[1], points[0]), ...points, reflect(points[n - 2], points[n - 1])];
  const out = [];
  for (let i = 1; i < padded.length - 2; i++) {
    for (let s = 0; s < samples; s++) {
      out.push(splinePoint(padded[i - 1], padded[i], padded[i + 1], padded[i + 2], s / samples));
    }
  }
  out.push(points[n - 1].slice(0, 2));
  return out;
}

const reflect = (a, b) => [2 * b[0] - a[0], 2 * b[1] - a[1]]; // a mirrored through b

function splinePoint(p0, p1, p2, p3, u) {
  const knot = (a, b) => Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5, 1e-6);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + u * (t2 - t1);
  const mix = (a, b, ta, tb) => [
    ((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta),
    ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta),
  ];
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  return mix(mix(a1, a2, 0, t2), mix(a2, a3, t1, t3), t1, t2);
}

// Points spaced evenly `spacing` apart along a polyline. Points can carry extra values after
// x and y (a width, say), which are interpolated along with them.
export function resample(points, spacing) {
  const out = [points[0]];
  let carry = 0; // distance from the last emitted point to the start of the current segment
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = spacing - carry;
    for (; d <= len; d += spacing) out.push(a.map((value, j) => value + ((b[j] - value) * d) / len));
    carry = len - (d - spacing);
  }
  return out;
}

// Cumulative length at each point.
export function measure(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    lengths.push(lengths[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  return lengths;
}

// The point at distance `s` along a polyline, given its `measure()`.
export function pointAt(points, lengths, s) {
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= s) lo = mid;
    else hi = mid;
  }
  const f = Math.min(1, Math.max(0, (s - lengths[lo]) / (lengths[hi] - lengths[lo] || 1)));
  return [points[lo][0] + (points[hi][0] - points[lo][0]) * f, points[lo][1] + (points[hi][1] - points[lo][1]) * f];
}
