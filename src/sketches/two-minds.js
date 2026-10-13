import { createNoise2D, createNoise3D } from 'simplex-noise';
import { oklch } from '../lib/color.js';
import { resample } from '../lib/curves.js';
import { pathPoints } from '../lib/svgpath.js';
import { FACE_PATH } from './two-minds/face.js';

// Scratchboard: a black coating over a living rainbow print. Every mark scratches the coating
// away, barely at first, then burning through; when something dies, the coating creeps back.
//
// Two faces look at each other. A star sparks at the center of each mind, and constellations
// grow slowly toward each other, out of the heads and into the space between, until a chain of
// stars links the two minds. Around them a sky of stars twinkles, burns out and is reborn, drawn
// into constellations of its own near the faces. It never ends: the minds drift apart and find
// each other again with a slow tide.
//
// Add ?speed=10 to the URL (before the #) to fast-forward.

const TAU = Math.PI * 2;
const W = 1600; // composed on a fixed board that's scaled to fit the window,
const H = 1000; // so a resize doesn't restart it
const STEP = 1 / 30; // fixed simulation step (seconds), so a seed always unfolds the same way
const SEG = 2; // length of one traced scratch segment
const COATING = '#0b0a0d';

const HEAD = 620; // head height
const GAP = 0.34 * HEAD; // between the nose tips

// Timeline (seconds)
const OUTLINE_TIME = 9;
const SPARK = 14; // the first star in each mind
const GROWTH = [35, 200]; // [start, duration] of the minds' first growth
const LINK_BURN = 8; // how long a line takes to burn in; it connects once mostly there

const MIND_NEURONS = 40; // most stars one mind holds
const BETWEEN_NEURONS = 32; // most stars in the space between the minds
const SPACING = [14, 30]; // a new star forms this near to the constellation
const REACH = 45; // the longest line a new star draws
const MEND_REACH = 70; // the longest line a broken bridge draws to mend itself
const FIELD_STARS = 150; // stars scattered across the sky, coming and going

// The face: a public-domain brush-stroke profile, facing right (see two-minds/face.js). Its SVG is
// the stroke's filled outline; we follow the middle of it from forehead to chin and keep how
// thick the brush was along the way, pared down to suit the fine lines of the piece.
const FACE_HEIGHT = 0.69; // forehead to chin, in head heights
const NOSE = [0.885, 0.59]; // where the tip of the nose sits, in head heights
const BRUSH = 0.5; // how much of the brush's thickness to keep
const FACE = faceStroke(); // [u, v, thickness] from forehead to chin, in head heights
const BRAIN = { x: 0.52, y: 0.4, rx: 0.24, ry: 0.18 }; // the ellipse a mind's stars form in

// The print under the coating is repainted at low resolution and stretched smooth.
const PW = W / 8;
const PH = H / 8;

export default {
  title: 'Two Minds',
  resizable: true,
  setup({ ctx, dpr, random }) {
    const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
    const noise2 = createNoise2D(random);
    const noise3 = createNoise3D(random);

    // Scratches live in a grayscale mask (white = scratched through) drawn with 'lighten', so
    // overlapping marks take the deeper one instead of piling up. Each frame the mask is
    // multiplied by the print and added onto the coating.
    const k = Math.min(2, Math.max(1, dpr * Math.max(screen.width / W, screen.height / H)));
    const settled = makeLayer(k); // scratches that have finished burning in
    const faces = makeLayer(k); // the face lines, which show white rather than the print
    const reveal = makeLayer(k); // this frame's scratches, seen through the print
    clearLayer(settled);
    clearLayer(faces);

    const print = makeCanvas(PW, PH);
    const printCtx = print.getContext('2d');
    const printImg = printCtx.createImageData(PW, PH);
    const spectrum = Array.from({ length: 360 }, (_, h) => oklch(0.74, 0.2, h));
    const hue0 = random(360);

    const glow = makeCanvas(W / 4, H / 4);
    const glowCtx = glow.getContext('2d');
    glowCtx.imageSmoothingQuality = 'high';
    const grain = ctx.createPattern(paintGrain(random), 'repeat');
    let vignette = null;

    const heads = [makeHead(-1), makeHead(1)];
    const between = { x: W / 2, y: heads[0].brain.y, rx: heads[1].brain.x - W / 2, ry: 0.2 * HEAD };
    const groups = new Set(); // everything scratched, grouped by what dies together
    let neurons = [];
    let active = []; // segments still burning in
    let tips = []; // styluses tracing the faces
    let waking = []; // stars still forming
    let forming = []; // lines still burning in
    let flares = [];
    let flashes = [];
    let dirty = false; // settled layer needs a rebuild
    let rewired = false; // a connection formed or died
    let lastLink = null; // the connection that formed most recently
    let connected = false; // is there a chain of stars from one mind to the other?
    let bond = new Set(); // the stars along that chain
    let closeness = 1; // the tide between the minds: 1 close, 0 apart
    let t = 0;
    let firstJoin = Infinity;
    let nextFlare = Infinity;
    let nextBetween = 0;
    let nextBond = 0;
    let nextWither = 0;
    let nextFlurry = 0;
    let nextField = 0;

    const outline = group('outline', { permanent: true, white: true });
    for (const head of heads) {
      const last = head.face.length - 1;
      trace(outline, head.face, {
        speed: (SEG * head.face.length) / OUTLINE_TIME,
        burn: 6,
        width: (p) => 0.35 + BRUSH * head.face[Math.round(p * last)][2],
        depth: () => 0.95,
      });
    }

    // --- Scratches ---------------------------------------------------------------------------

    function group(kind, extra) {
      const g = { kind, segs: [], fading: null, ...extra };
      groups.add(g);
      return g;
    }

    // A scratch starts barely through the coating and burns in over `burn` seconds.
    function scratch(g, x1, y1, x2, y2, width, depth, burn) {
      const seg = { g, x1, y1, x2, y2, width, depth, born: t, burn };
      g.segs.push(seg);
      active.push(seg);
    }

    function cov(s) {
      const p = Math.min(1, (t - s.born) / s.burn);
      return s.depth * (0.06 + 0.94 * smoothstep(p));
    }

    function stroke(c, s, level) {
      const v = Math.round(level * 255);
      c.strokeStyle = `rgb(${v},${v},${v})`;
      c.lineWidth = s.width;
      c.beginPath();
      c.moveTo(s.x1, s.y1);
      c.lineTo(s.x2, s.y2);
      c.stroke();
    }

    function settle() {
      active = active.filter((s) => {
        if (s.g.fading) return false; // drawn by the fade from now on
        if (t < s.born + s.burn) return true;
        stroke(s.g.white ? faces : settled, s, s.depth);
        s.settled = true;
        return false;
      });
    }

    // The coating creeps back over a group.
    function fade(g, dur) {
      if (g.fading || g.permanent) return;
      g.fading = { start: t, dur };
      for (const s of g.segs) if (!s.settled) s.depth = cov(s);
      if (g.kind === 'link') rewired = true;
      dirty = true;
    }

    function rebuild() {
      clearLayer(settled);
      for (const g of groups) {
        if (!g.fading && !g.white) for (const s of g.segs) if (s.settled) stroke(settled, s, s.depth);
      }
    }

    // A stylus following a fixed path: the faces.
    function trace(g, points, { speed, burn, width, depth }) {
      tips.push({ g, points, i: 0, x: points[0][0], y: points[0][1], acc: 0, done: false, speed, burn, width, depth });
    }

    function advance(tip) {
      if (tip.g.fading) tip.done = true;
      tip.acc += tip.speed * STEP;
      while (tip.acc >= SEG && !tip.done) {
        tip.acc -= SEG;
        const [x1, y1] = tip.points[tip.i];
        const [x2, y2] = tip.points[tip.i + 1];
        const p = tip.i / (tip.points.length - 1);
        scratch(tip.g, x1, y1, x2, y2, tip.width(p), tip.depth(p), tip.burn);
        tip.x = x2;
        tip.y = y2;
        if (++tip.i >= tip.points.length - 1) tip.done = true;
      }
    }

    // --- Stars -------------------------------------------------------------------------------

    // `home` is the head a star lives in; stars between or around the heads have none.
    // `side` is the mind it belongs to or grew out from (0 left, 1 right), if any.
    // `slow` > 1 stretches out how long it takes to appear, for the first stars.
    function addNeuron(x, y, { home, zone, side, slow = 1 }) {
      // A few brighter stars, like a real sky; out in the field most are faint.
      const bright = random.chance(zone === 'field' ? 0.1 : 0.15);
      const r = bright ? random(1.5, 2.3) : zone === 'field' ? random(0.6, 1.1) : random(0.8, 1.3);
      const n = {
        x, y, home, zone, side, slow, r, born: t, id: random(100), connectTo: [], wants: 0, also: [],
        life: { field: random(40, 200), between: random(120, 360), mind: random(150, 450) }[zone],
      };
      n.g = group('neuron', { neuron: n });
      neurons.push(n);
      n.burn = zone === 'field' ? 5 : 18 * slow;
      scratch(n.g, x, y, x, y + 0.01, 1.6 * r, 0.95, n.burn); // a dot, with the layer's round caps
      waking.push(n);
      return n;
    }

    // A star that has formed draws its lines: to the nearest candidates that keep the chart clean.
    function wake(n) {
      n.ready = true;
      let made = 0;
      for (const to of n.connectTo) if (made < n.wants && !to.dead && link(n, to)) made++;
      for (const to of n.also) if (!to.dead) link(n, to);
    }

    // A constellation line between two stars. It doesn't travel across: it fades in along its
    // whole length, flickering, and counts as a connection once it has mostly burned in.
    // Lines never cross each other or run past another star; returns whether it was drawn.
    function link(from, to) {
      if (from === to || linked(from, to) || blocked(from, to)) return false;
      const d = dist(from, to);
      const gap = (n) => n.r + 2; // star charts leave a little space around each star
      if (d <= gap(from) + gap(to) + 2) return false;
      const ux = (to.x - from.x) / d;
      const uy = (to.y - from.y) / d;
      const points = [
        [from.x + ux * gap(from), from.y + uy * gap(from)],
        [to.x - ux * gap(to), to.y - uy * gap(to)],
      ];
      const g = group('link', { from, to, points, born: t, id: random(100) });
      scratch(g, ...points[0], ...points[1], 0.45, 0.6, LINK_BURN);
      forming.push(g);
      return true;
    }

    function blocked(a, b) {
      for (const g of groups) {
        if (g.kind !== 'link' || g.fading || g.from === a || g.from === b || g.to === a || g.to === b) continue;
        if (crosses(a, b, g.from, g.to)) return true;
      }
      return neurons.some((n) => n !== a && n !== b && distToSegment(n, a, b) < n.r + 3);
    }

    // A new star joins the constellation and connects to its nearest neighbors on its side.
    function birth([x, y], options) {
      const n = addNeuron(x, y, options);
      const kin = (options.kin ?? neurons).filter((m) => m !== n && (n.side === undefined || m.side === n.side || options.kin));
      const near = nearest(kin, n, 4).filter((m) => dist(m, n) < REACH);
      n.connectTo = near; // nearest first, tried in order when the star has formed
      n.wants = n.zone === 'between' || random.chance(0.4) ? 2 : 1;
      if (n.zone === 'between') {
        // Reach across to the other mind's growth when it's close.
        const [across] = nearest(neurons.filter((m) => m.side === 1 - n.side), n, 1);
        if (across && dist(across, n) < REACH) n.also.push(across);
      }
      if (near.length && random.chance(0.3)) {
        // An older star reaches back to the newcomer.
        const other = random.pick(near.slice(0, 3));
        if (other.ready) link(other, n);
        else other.also.push(n);
      }
      return n;
    }

    function linked(a, b) {
      for (const g of groups) {
        if (g.kind === 'link' && !g.fading && ((g.from === a && g.to === b) || (g.from === b && g.to === a))) return true;
      }
      return false;
    }

    function nearest(list, n, count) {
      return [...list].sort((a, b) => dist(a, n) - dist(b, n)).slice(0, count);
    }

    // A star goes out, fading over `dur` seconds along with its lines.
    function kill(n, dur = 18) {
      n.dead = true;
      neurons = neurons.filter((m) => m !== n);
      fade(n.g, dur);
      for (const g of groups) if (g.from === n || g.to === n) fade(g, Math.min(dur, 15));
    }

    // A spot next to `kin` but not crowding anyone: the best of many tries, scored by `pull`.
    function findSpot(sample, pull, kin) {
      const lines = [...groups].filter((g) => g.kind === 'link' && !g.fading);
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 60; i++) {
        const c = sample();
        if (!c) continue;
        const closest = (list) => Math.min(...list.map((n) => Math.hypot(n.x - c[0], n.y - c[1])));
        if (closest(neurons) < SPACING[0] || closest(kin) > SPACING[1]) continue;
        const spot = { x: c[0], y: c[1] };
        if (lines.some((g) => distToSegment(spot, g.from, g.to) < 5)) continue;
        const score = pull(c) + random(4);
        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
      }
      return best;
    }

    // 0 until the minds have first met (or ten minutes pass), then eases to 1: births and deaths
    // in balance.
    const living = () => smoothstep((t - Math.min(firstJoin + 60, 600)) / 120);

    function tendMind(head, i) {
      if (t < SPARK) return;
      const mine = neurons.filter((n) => n.home === head);
      if (!mine.length) {
        // The first star, barely a scratch: or a new beginning, if they've all died.
        if (t >= head.nextBirth) {
          const slow = head.sparked ? 1.3 : 1.6;
          addNeuron(head.brain.x + random(-6, 6), head.brain.y + random(-6, 6), { home: head, zone: 'mind', side: i, slow });
          head.sparked = true;
          head.nextBirth = t + 30;
        }
        return;
      }

      const grown = smoothstep((t - GROWTH[0]) / GROWTH[1]);
      const tide = 0.6 + 0.4 * (0.5 + 0.5 * noise2(t / 300, 40 + i * 13));
      const target = 1 + (MIND_NEURONS - 1) * grown * (1 + (tide - 1) * living());

      if (mine.length < target && t >= head.nextBirth) {
        // At first the constellation grows toward the face, toward the other mind; later it fills in.
        const forward = t < firstJoin ? 14 : 2;
        const spot = findSpot(
          () => sampleEllipse(head.brain, 0.95),
          ([x]) => (forward * head.facing * (x - head.brain.x)) / head.brain.rx,
          mine,
        );
        if (spot) {
          birth(spot, { home: head, zone: 'mind', side: i, slow: Math.max(1, 1.8 - mine.length * 0.04) });
          head.nextBirth = t + (t < firstJoin ? random(2, 4) : random(1.5, 3.5));
        }
      }

      if (living() > 0 && t >= head.nextDeath) {
        const victim = dying(mine, target);
        if (victim) {
          kill(victim);
          head.nextDeath = t + random(2, 5);
        }
      }

      if (t >= head.nextRewire) {
        // Too many connections, and one is lost.
        head.nextRewire = t + random(15, 35);
        const ready = mine.filter((n) => n.ready);
        const links = [...groups].filter((g) => g.kind === 'link' && g.from.home === head && g.to.home === head && g.formed && !g.fading);
        if (links.length > ready.length * 1.5) fade(random.pick(links), 15);
      }
    }

    // Stars in the space between the heads: the bridge, rising and falling with a slow tide.
    function tendBetween() {
      // While the minds are apart, whatever each one reaches links up with the nearest growth
      // it doesn't, mending broken chains until the two meet again.
      if (!connected && t >= nextBond) {
        nextBond = t + random(5, 12);
        const next = wiring();
        const pairs = [];
        for (const side of [0, 1]) {
          const reached = reachable(side, next);
          for (const a of reached.keys()) {
            if (!a.ready) continue;
            for (const b of neurons) {
              if (reached.has(b) || !b.ready || b.zone === 'field' || dist(a, b) >= MEND_REACH) continue;
              pairs.push([a, b]);
            }
          }
        }
        pairs.sort(([a, b], [c, d]) => dist(a, b) - dist(c, d));
        const pair = pairs.find(([a, b]) => !linked(a, b) && !blocked(a, b));
        if (pair) link(...(random.chance() ? pair : pair.reverse()));
      }

      if (t < nextBetween) return;
      nextBetween = t + 1;
      const here = neurons.filter((n) => n.zone === 'between');
      // Mostly close, sometimes drifting all the way apart.
      const tide = (closeness = Math.min(1, Math.max(0, 0.8 + 0.55 * noise2(t / 240, 7))));
      const target = BETWEEN_NEURONS * smoothstep((t - 90) / 90) * (1 + (tide - 1) * living());

      // What each mind is still attached to, counting lines still burning in.
      const next = wiring(true);
      const reached = [0, 1].map((side) => reachable(side, next));

      // Growth cut off from both minds withers.
      const orphans = here.filter((n) => n.ready && !reached[0].has(n) && !reached[1].has(n));
      if (living() > 0 && orphans.length && t >= nextWither) {
        kill(random.pick(orphans));
        nextWither = t + random(3, 8);
      }

      // A broken bridge regrows unless the tide is low.
      const mending = !connected && tide > 0.45 && here.length < BETWEEN_NEURONS * 1.2;
      if (here.length < target || mending) {
        // Each mind grows its half out from the forehead toward the middle, taking turns. Once
        // they've met, new growth spreads along the bridge instead.
        const counts = [0, 1].map((side) => here.filter((n) => n.side === side).length);
        const order = counts[0] === counts[1] ? shuffle([0, 1]) : counts[0] < counts[1] ? [0, 1] : [1, 0];
        const pull = connected
          ? ([, y]) => -0.3 * Math.abs(y - between.y)
          : ([x, y]) => -Math.abs(x - W / 2) - 0.3 * Math.abs(y - between.y);
        for (const side of order) {
          if (counts[side] >= Math.max(target, mending ? BETWEEN_NEURONS * 1.2 : 0) / 2) continue;
          const kin = [...reached[side].keys()];
          const frontier = connected
            ? kin.filter((n) => n.zone === 'between')
            : [...kin].sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2)).slice(0, 6);
          if (!frontier.length) continue;
          const spot = findSpot(
            () => {
              const n = random.pick(frontier);
              const a = random(TAU);
              const r = random(SPACING[0] + 2, SPACING[1] - 2);
              const c = [n.x + Math.cos(a) * r, n.y + Math.sin(a) * r];
              return insideEllipse(between, c, 1) && !heads.some((h) => insideEllipse(h.brain, c, 0.95)) ? c : null;
            },
            pull,
            kin,
          );
          if (spot) {
            birth(spot, { zone: 'between', side, kin });
            nextBetween = t + (t < firstJoin ? random(2, 4) : random(2.5, 5));
            return;
          }
        }
      } else if (living() > 0) {
        // Thins from its loose ends first, so it only breaks when the tide is truly low.
        const victim = dying(here, target, (n) => (next.get(n)?.length ?? 0) <= 1);
        if (victim) {
          kill(victim);
          nextBetween = t + random(3, 6);
        }
      }
    }

    // Now and then a flurry: several new lines appear at once.
    function flurry() {
      if (t < nextFlurry) return;
      nextFlurry = t + random(10, 25);
      const ready = neurons.filter((n) => n.ready && n.zone !== 'field');
      const links = [...groups].filter((g) => g.kind === 'link' && !g.fading).length;
      if (ready.length < 6 || links > ready.length * 1.6) return;
      const nearby = nearest(ready, random.pick(ready), 10);
      for (let tries = 0, made = 0, want = random.int(3, 5); tries < 20 && made < want; tries++) {
        const a = random.pick(nearby);
        const b = random.pick(nearby);
        if (a !== b && dist(a, b) < REACH * 1.3 && link(a, b)) made++;
      }
    }

    // The sky: stars scattered everywhere, twinkling, burning out and being reborn. They gather
    // more thickly near the faces, and the nearer they are, the more they join into
    // constellations of their own.
    function tendField() {
      for (const n of neurons) {
        if (n.zone !== 'field' || t - n.born <= n.life) continue;
        kill(n, 4);
      }
      const field = neurons.filter((n) => n.zone === 'field');
      if (t < nextField || field.length >= FIELD_STARS * smoothstep((t - 5) / 120)) return;
      nextField = t + random(0.1, 0.4);

      // A few tries for a spot: thicker near the faces, and clear of the minds, the bridge,
      // the face lines and other stars.
      let c = null;
      let near = 0;
      for (let i = 0; i < 6 && !c; i++) {
        c = [random(20, W - 20), random(20, H - 20)];
        near = nearFaces(c);
        if (
          !random.chance(0.3 + 0.7 * near) ||
          heads.some((h) => insideEllipse(h.brain, c, 1.25)) ||
          insideEllipse(between, c, 1.15) ||
          heads.some((h) => h.face.some(([x, y], j) => j % 4 === 0 && Math.hypot(x - c[0], y - c[1]) < 10)) ||
          neurons.some((m) => Math.hypot(m.x - c[0], m.y - c[1]) < 12)
        ) c = null;
      }
      if (!c) return;

      const n = addNeuron(c[0], c[1], { zone: 'field' });
      const reach = 30 + 40 * near;
      n.connectTo = nearest(field, n, 4).filter((m) => dist(m, n) < reach);
      n.wants = random.chance(near) ? (random.chance(near) ? 2 : 1) : 0;
    }

    // 1 at the face lines, falling to 0 a few hundred units away.
    function nearFaces([x, y]) {
      let d = Infinity;
      for (const h of heads) for (let i = 0; i < h.face.length; i += 4) d = Math.min(d, Math.hypot(h.face[i][0] - x, h.face[i][1] - y));
      return Math.max(0, 1 - d / 320);
    }

    // Who dies next: one past its lifespan, or if there are more than the tide allows, any
    // (preferring those `spare` picks).
    function dying(pool, target, spare = () => true) {
      let ready = pool.filter((n) => n.ready);
      if (closeness > 0.45) {
        // While the minds are close, what joins them is kept alive.
        for (const n of ready) if (bond.has(n) && t - n.born > n.life) n.life += random(60, 180);
        ready = ready.filter((n) => !bond.has(n));
      }
      const expired = ready.find((n) => t - n.born > n.life);
      if (expired || pool.length <= target + 1) return expired;
      const spared = ready.filter(spare);
      return random.pick(spared.length ? spared : ready);
    }

    // --- Between the minds -------------------------------------------------------------------

    // Formed connections (or all of them, with `burning`), as a map from each star to the
    // lines leaving it.
    function wiring(burning = false) {
      const next = new Map();
      const add = (a, b, g) => {
        if (!next.has(a)) next.set(a, []);
        next.get(a).push({ to: b, g });
      };
      for (const g of groups) {
        if (g.kind !== 'link' || !(g.formed || burning) || g.fading) continue;
        add(g.from, g.to, g);
        add(g.to, g.from, g);
      }
      return next;
    }

    // Everything one mind reaches through formed connections, mapped to the step that reached
    // it (null for the mind's own stars). Ties are broken randomly so routes vary. Stops early
    // if it reaches a star that `until` accepts.
    function reachable(side, next, until) {
      const queue = shuffle(neurons.filter((n) => n.home === heads[side]));
      const came = new Map(queue.map((n) => [n, null]));
      while (queue.length) {
        const n = queue.shift();
        if (until?.(n)) break;
        for (const e of shuffle(next.get(n) ?? [])) {
          if (came.has(e.to)) continue;
          came.set(e.to, { from: n, ...e });
          queue.push(e.to);
        }
      }
      return came;
    }

    // A chain of formed connections from the left mind to the right, or null.
    function crossing() {
      let end = null;
      const came = reachable(0, wiring(), (n) => n.home === heads[1] && (end = n));
      if (!end) return null;
      const steps = [];
      for (let m = end; came.get(m); m = came.get(m).from) steps.unshift(came.get(m));
      return { groups: steps.map((e) => e.g), neurons: [steps[0].from, ...steps.map((e) => e.to)] };
    }

    function shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    // The minds have (re)connected: the whole chain between them flares at once.
    function joined(chain) {
      const first = firstJoin === Infinity;
      if (first) firstJoin = t;
      const closing = chain.groups.includes(lastLink) ? lastLink : chain.groups[chain.groups.length >> 1];
      const [[x1, y1], [x2, y2]] = closing.points;
      flashes.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, born: t, life: first ? 6 : 4, r: first ? 12 : 8, alpha: 0.4 });
      flares.push({ groups: chain.groups, born: t, life: first ? 8 : 5, strength: 1 });
      nextFlare = t + 10;
    }

    // Now and then part of the constellation flares, all at once: sometimes the whole chain
    // between the minds, sometimes a star and the lines around it.
    function sendFlare() {
      let lit = connected && random.chance(0.4) ? crossing()?.groups : null;
      if (!lit) {
        const formed = [...groups].filter((g) => g.kind === 'link' && g.formed && !g.fading);
        if (!formed.length) return;
        const seed = random.pick(formed);
        const star = random.chance() ? seed.from : seed.to;
        lit = formed.filter((g) => g.from === star || g.to === star);
      }
      flares.push({ groups: lit, born: t, life: random(4, 6), strength: 0.35 });
    }

    // --- Loop --------------------------------------------------------------------------------

    function step() {
      t += STEP;
      heads.forEach(tendMind);
      tendBetween();
      flurry();
      tendField();
      for (let i = 0; i < tips.length; i++) advance(tips[i]);
      tips = tips.filter((tip) => !tip.done);
      waking = waking.filter((n) => {
        if (n.dead) return false;
        if (t < n.born + 3 * n.slow) return true;
        wake(n);
        return false;
      });
      settle();

      forming = forming.filter((g) => {
        if (g.fading) return false;
        if (t < g.born + LINK_BURN * 0.6) return true;
        g.formed = true;
        lastLink = g;
        rewired = true;
        return false;
      });

      if (rewired) {
        rewired = false;
        const chain = crossing();
        if (chain && !connected) joined(chain);
        connected = !!chain;
        bond = new Set(chain?.neurons);
      }

      if (t >= nextFlare) {
        sendFlare();
        nextFlare = t + random(4, 9);
      }
      flares = flares.filter((f) => t - f.born < f.life && !f.groups.some((g) => g.fading));
      flashes = flashes.filter((f) => t - f.born < f.life);

      for (const g of groups) if (g.fading && t > g.fading.start + g.fading.dur) groups.delete(g);
      if (dirty) {
        rebuild();
        dirty = false;
      }
    }

    function render({ ctx, canvas, width, height, dpr, time }) {
      // This frame's scratches: the settled ones, plus those still burning in or fading...
      reveal.globalCompositeOperation = 'source-over';
      reveal.drawImage(settled.canvas, 0, 0, W, H);
      reveal.globalCompositeOperation = 'lighten';
      for (const s of active) if (!s.g.white) stroke(reveal, s, cov(s));
      for (const g of groups) {
        if (!g.fading) continue;
        const gone = smoothstep((t - g.fading.start) / g.fading.dur);
        for (const s of g.segs) stroke(reveal, s, s.depth * (1 - gone));
      }
      // ...seen through the print.
      reveal.globalCompositeOperation = 'multiply';
      reveal.drawImage(print, 0, 0, W, H);
      // The faces go on after, in white.
      reveal.globalCompositeOperation = 'lighten';
      reveal.drawImage(faces.canvas, 0, 0, W, H);
      for (const s of active) if (s.g.white) stroke(reveal, s, cov(s));

      const scale = Math.min(width / W, height / H);
      const ox = (width - W * scale) / 2;
      const oy = (height - H * scale) / 2;

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COATING;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(reveal.canvas, 0, 0, W, H);

      // Glow: a blurred, downscaled copy of the scratches added back on top.
      glowCtx.globalCompositeOperation = 'copy';
      glowCtx.filter = 'blur(3px)';
      glowCtx.drawImage(reveal.canvas, 0, 0, W / 4, H / 4);
      glowCtx.filter = 'none';
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glow, 0, 0, W, H);

      // Light in the scratches, in the print's own colors. Twinkling runs on the real clock
      // (`time`) so it doesn't race when fast-forwarded.
      const light = ctx.createPattern(print, 'no-repeat');
      light.setTransform(new DOMMatrix().scale(W / PW));
      ctx.fillStyle = ctx.strokeStyle = light;
      const fading = (g) => (g.fading ? 1 - (t - g.fading.start) / g.fading.dur : 1);

      // The stylus tracing the faces.
      ctx.fillStyle = '#fff';
      for (const tip of tips) if (tip.g === outline) shine(ctx, tip.x, tip.y, 1.6, 0.35);
      ctx.fillStyle = light;

      // Lines flicker as they appear, then twinkle now and then.
      for (const g of groups) {
        if (g.kind !== 'link') continue;
        const age = t - g.born;
        const appearing = age < LINK_BURN ? (1 - age / LINK_BURN) * (0.5 + 0.5 * noise2(time * 4, g.id)) : 0;
        const twinkle = smoothstep((noise2(time * 0.4, g.id) - 0.55) / 0.35);
        line(ctx, g.points, Math.max(0.35 * appearing, 0.3 * twinkle) * fading(g), 0.8);
      }

      // Flares: a stretch of the constellation brightening all at once, flickering.
      for (const f of flares) {
        const swell = Math.sin(Math.PI * ((t - f.born) / f.life));
        for (const g of f.groups) line(ctx, g.points, f.strength * swell * (0.6 + 0.4 * noise2(time * 3, g.id)), 0.9);
      }

      // Each star shimmers softly, and now and then glints.
      for (const g of groups) {
        if (g.kind !== 'neuron') continue;
        const n = g.neuron;
        const kindled = Math.min(1, (t - n.born) / (n.burn + 5)) * fading(g);
        const shimmer = 0.5 + 0.5 * noise2(time * 1.2, n.id);
        const glint = smoothstep((noise2(time * 0.5, n.id + 50) - 0.65) / 0.25);
        const size = n.r / 1.1;
        shine(ctx, n.x, n.y, 0.8 * size, kindled * size * (0.15 + 0.1 * shimmer + 0.5 * glint));
        if (glint > 0) spikes(ctx, n.x, n.y, (2 + 5 * glint) * size, 0.6 * kindled * glint);
      }

      for (const f of flashes) {
        const p = (t - f.born) / f.life;
        shine(ctx, f.x, f.y, f.r * (0.3 + 0.7 * Math.sqrt(p)), f.alpha * (1 - p) ** 2);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (vignette?.w !== canvas.width || vignette?.h !== canvas.height) {
        const { width: w, height: h } = canvas;
        const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
        vignette = { w, h, gradient };
      }
      ctx.fillStyle = vignette.gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let last = 0;
    let clock = 0;
    let frame = 0;
    return (props) => {
      clock += Math.min(props.time - last, 0.1) * speed;
      last = props.time;
      for (let n = 0; clock >= STEP && n < 600; n++) {
        step();
        clock -= STEP;
      }
      if (frame++ % 2 === 0) {
        paintPrint(printImg.data, noise3, spectrum, hue0 + t * 0.8, t * 0.015);
        printCtx.putImageData(printImg, 0, 0);
      }
      render(props);
    };

    function sampleEllipse(e, scale) {
      const a = random(TAU);
      const r = Math.sqrt(random()) * scale;
      return [e.x + Math.cos(a) * r * e.rx, e.y + Math.sin(a) * r * e.ry];
    }
  },
};

// The rainbow under the coating: the spectrum sweeps left to right, so each mind has its own
// colors and the space between them crosses all of it, marbled by slowly flowing noise.
function paintPrint(data, noise3, spectrum, hue, z) {
  let i = 0;
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const u = x / PW;
      const v = y / PH;
      const marble = 0.4 * noise3(u * 1.7, v * 1.7, z) + 0.12 * noise3(u * 5, v * 5 + 3, z * 2);
      const h = Math.floor(hue + (u + marble) * 300);
      const [r, g, b] = spectrum[((h % 360) + 360) % 360];
      const shimmer = 0.9 + 0.25 * noise3(u * 4 + 11, v * 4, z * 3);
      data[i++] = r * shimmer;
      data[i++] = g * shimmer;
      data[i++] = b * shimmer;
      data[i++] = 255;
    }
  }
}

function paintGrain(random) {
  const canvas = makeCanvas(128, 128);
  const g = canvas.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = random(9);
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

function makeHead(side) {
  // side -1: the left head, facing right. side 1: the right head, mirrored.
  const nose = Math.max(...FACE.map(([u]) => u));
  const top = 480 - 0.56 * HEAD;
  const at = (u, v) => [W / 2 + side * (GAP / 2 + (nose - u) * HEAD), top + v * HEAD];
  const [bx, by] = at(BRAIN.x, BRAIN.y);
  return {
    facing: -side,
    face: resample(FACE.map(([u, v, w]) => [...at(u, v), w * HEAD]), SEG), // [x, y, brush thickness]
    brain: { x: bx, y: by, rx: BRAIN.rx * HEAD, ry: BRAIN.ry * HEAD },
    nextBirth: 0,
    nextDeath: 0,
    nextRewire: 0,
  };
}

// The middle of the brush stroke, forehead to chin: each point of the stroke's descending edge
// paired with the nearest point on its rising edge.
function faceStroke() {
  const outline = pathPoints(FACE_PATH);
  const ys = outline.map(([, y]) => y);
  const top = ys.indexOf(Math.min(...ys));
  const rising = outline.slice(0, top + 1);
  const tip = outline.reduce((a, b) => (b[0] > a[0] ? b : a)); // tip of the nose
  const k = FACE_HEIGHT / (Math.max(...ys) - ys[top]);
  const middle = outline.slice(top).map((b) => {
    const a = closestOnPolyline(rising, b);
    const [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return [NOSE[0] + (x - tip[0]) * k, NOSE[1] + (y - tip[1]) * k, Math.hypot(a[0] - b[0], a[1] - b[1]) * k];
  });
  // Smooth out the small wobble that pairing the two edges leaves.
  return middle.map((p, i) => {
    const near = middle.slice(Math.max(0, i - 2), i + 3);
    return p.map((_, j) => near.reduce((sum, q) => sum + q[j], 0) / near.length);
  });
}

function closestOnPolyline(points, [px, py]) {
  let best = points[0];
  let bestDist = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const f = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const q = [ax + f * dx, ay + f * dy];
    const d = Math.hypot(q[0] - px, q[1] - py);
    if (d < bestDist) {
      best = q;
      bestDist = d;
    }
  }
  return best;
}

function makeLayer(k) {
  const c = makeCanvas(Math.round(W * k), Math.round(H * k)).getContext('2d');
  c.setTransform(k, 0, 0, k, 0, 0);
  c.lineCap = 'round'; // with 'lighten', overlapping caps don't pile up, so joints stay seamless
  return c;
}

function clearLayer(c) {
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'lighten';
}

function shine(ctx, x, y, r, alpha) {
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha) * 0.15;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, TAU);
  ctx.fill();
}

function line(ctx, [[x1, y1], [x2, y2]], alpha, width) {
  if (alpha < 0.01) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// A four-point star glint: two thin tapering spikes crossing.
function spikes(ctx, x, y, length, alpha) {
  const w = 0.35;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.beginPath();
  ctx.moveTo(x - length, y);
  ctx.lineTo(x, y - w);
  ctx.lineTo(x + length, y);
  ctx.lineTo(x, y + w);
  ctx.closePath();
  ctx.moveTo(x, y - length);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + length);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const turn = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
// Do segments ab and cd cross (touching at an end doesn't count)?
const crosses = (a, b, c, d) => turn(c, d, a) * turn(c, d, b) < 0 && turn(a, b, c) * turn(a, b, d) < 0;

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - f * dx, p.y - a.y - f * dy);
}
const insideEllipse = (e, [x, y], scale) => ((x - e.x) / (e.rx * scale)) ** 2 + ((y - e.y) / (e.ry * scale)) ** 2 < 1;
const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
