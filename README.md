# MindScratch

A gallery of generative art sketches, built with Vite and plain canvas.

**Live:** https://krotzbotz.github.io/MindScratch/ · **Two Minds:** https://krotzbotz.github.io/MindScratch/#/two-minds

Every push to `main` rebuilds and publishes the site to GitHub Pages (`.github/workflows/deploy.yml`).

```bash
npm install
npm run dev      # local dev server with reload on save
npm run build    # static site in dist/
```

## Adding a sketch

Drop a file in `src/sketches/`. It shows up in the gallery automatically, and its filename becomes the URL (`#/my-sketch`).

```js
export default {
  title: 'My Sketch',
  setup({ ctx, width, height, random }) {
    // Draw here. Return nothing for a static piece...
    return ({ time, frame }) => {
      // ...or return a function to animate it, called every frame.
    };
  },
};
```

`setup` receives:

| prop | |
| --- | --- |
| `ctx` | 2D canvas context, already scaled for retina screens |
| `canvas` | the canvas element |
| `width`, `height` | canvas size in CSS pixels |
| `dpr` | device pixel ratio (2 on retina screens) |
| `random` | seeded RNG; see `src/lib/random.js` for `random.int`, `random.pick`, `random.chance` |
| `time`, `frame` | seconds and frames since start (useful in the draw function) |

The seed is in the URL (`#/flow-field/12345`), so a reload redraws the same piece and you can share a link to a specific one. Use `random` instead of `Math.random` to keep that working. For seeded noise, pass it to simplex-noise: `createNoise2D(random)`.

`setup` re-runs when the window resizes. For a long-running piece that shouldn't restart, set `resizable: true` next to `title`; it keeps running and the draw function sees the new `width`/`height`.

## Keys

- **R** reseeds the sketch for a new variation
- **S** saves the canvas as a PNG

## Use as a background

Add `?bg` to a sketch's URL to hide the mouse cursor:

https://krotzbotz.github.io/MindScratch/?bg#/two-minds

On a Mac, the free [Plash](https://sindresorhus.com/plash) app sets a website as an animated desktop wallpaper: add the link above. Add a seed (`#/two-minds/7`) to get the same piece every time instead of a new one.

## Start page

https://krotzbotz.github.io/MindScratch/#/search is Two Minds with a Google search box, ready to type into. Set it as your browser's home page or new-tab page.

## Credits

The face in Two Minds is "Profile", a public-domain drawing from [openclipart](https://openclipart.org) via [freesvg.org](https://freesvg.org/profile).
