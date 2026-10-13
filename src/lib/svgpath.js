// Points along an SVG path's `d` (M, L, H, V, C, S and Z, absolute or relative), with each curve
// sampled `samples` times: enough for outlines drawn in tools like Inkscape.
export function pathPoints(d, samples = 8) {
  const tokens = d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  const isCommand = (token) => /^[a-df-zA-DF-Z]$/.test(token);
  const points = [];
  let i = 0;
  let cmd = '';
  let prev = '';
  let [x, y, startX, startY, ctrlX, ctrlY] = [0, 0, 0, 0, 0, 0];
  const num = () => Number(tokens[i++]);

  const curve = (x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= samples; k++) {
      const t = k / samples;
      const s = 1 - t;
      points.push([
        s * s * s * x + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3,
        s * s * s * y + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3,
      ]);
    }
    [ctrlX, ctrlY, x, y] = [x2, y2, x3, y3];
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) cmd = tokens[i++];
    const relative = cmd === cmd.toLowerCase();
    const [ox, oy] = relative ? [x, y] : [0, 0];
    switch (cmd.toLowerCase()) {
      case 'm':
        x = ox + num();
        y = oy + num();
        [startX, startY] = [x, y];
        points.push([x, y]);
        cmd = relative ? 'l' : 'L'; // any further pairs are line-tos
        break;
      case 'l':
        x = ox + num();
        y = oy + num();
        points.push([x, y]);
        break;
      case 'h':
        x = ox + num();
        points.push([x, y]);
        break;
      case 'v':
        y = oy + num();
        points.push([x, y]);
        break;
      case 'c':
        curve(ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num());
        break;
      case 's': {
        // The first control point mirrors the previous curve's second one.
        const smooth = /[cs]/i.test(prev);
        curve(smooth ? 2 * x - ctrlX : x, smooth ? 2 * y - ctrlY : y, ox + num(), oy + num(), ox + num(), oy + num());
        break;
      }
      case 'z':
        [x, y] = [startX, startY];
        points.push([x, y]);
        if (i < tokens.length && !isCommand(tokens[i])) throw new Error('SVG path: numbers after z');
        break;
      default:
        throw new Error(`SVG path: unsupported command ${cmd}`);
    }
    prev = cmd;
  }
  return points;
}
