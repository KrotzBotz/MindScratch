// Seeded random number generator (mulberry32), so the same seed always draws the same piece.
//   random()        -> [0, 1)
//   random(max)     -> [0, max)
//   random(min,max) -> [min, max)
//   random.int(min, max)  -> integer in [min, max]
//   random.pick(array)    -> random element
//   random.chance(p)      -> true with probability p
// It also works as the source for seeded noise: createNoise2D(random) from simplex-noise.
export function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random = (min, max) => {
    if (min === undefined) return next();
    if (max === undefined) [min, max] = [0, min];
    return min + next() * (max - min);
  };
  random.int = (min, max) => Math.floor(random(min, max + 1));
  random.pick = (array) => array[Math.floor(next() * array.length)];
  random.chance = (p = 0.5) => next() < p;

  return random;
}
