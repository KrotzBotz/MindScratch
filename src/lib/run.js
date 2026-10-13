import { createRandom } from './random.js';

// Runs a sketch on a canvas: handles retina scaling, resizing, the animation loop and teardown.
export function run(canvas, sketch, seed) {
  const ctx = canvas.getContext('2d');
  const props = { ctx, canvas };
  let raf = 0;
  let animating = false;

  // Match the canvas buffer to its on-screen size at full device resolution.
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    props.dpr = dpr;
    props.width = canvas.clientWidth;
    props.height = canvas.clientHeight;
    canvas.width = Math.round(props.width * dpr);
    canvas.height = Math.round(props.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function start() {
    cancelAnimationFrame(raf);
    fit();
    Object.assign(props, { random: createRandom(seed), time: 0, frame: 0 });

    const draw = sketch.setup(props);
    animating = typeof draw === 'function';
    if (!animating) return; // static sketch: setup() did all the drawing

    const t0 = performance.now();
    const tick = (now) => {
      props.time = (now - t0) / 1000;
      draw(props);
      props.frame++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // A resize restarts the sketch from setup(), unless it sets `resizable: true`
  // to keep running and pick up the new width/height on its next frame.
  const observer = new ResizeObserver(() => (animating && sketch.resizable ? fit() : start()));
  observer.observe(canvas);

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}
