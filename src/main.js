import './style.css';
import { run } from './lib/run.js';

// Every file in src/sketches/ is picked up automatically; the filename is the URL slug.
const modules = import.meta.glob('./sketches/*.js', { eager: true });
const sketches = Object.entries(modules)
  .map(([path, mod]) => ({ slug: path.match(/([^/]+)\.js$/)[1], ...mod.default }))
  .sort((a, b) => a.title.localeCompare(b.title));

const app = document.getElementById('app');
let current = null; // { sketch, seed, stop }

// ?bg shows a sketch on its own, for use as a background: no overlay, no cursor.
const background = new URLSearchParams(location.search).has('bg');
document.body.classList.toggle('bg', background);

const newSeed = () => Math.floor(Math.random() * 1e9);

// Routes: #/ is the gallery, #/<slug>/<seed> is a sketch. The seed lives in the URL
// so a reload (including Vite's reload on save) redraws the same piece.
function render() {
  current?.stop();
  current = null;

  const [slug, seedParam] = location.hash.replace(/^#\/?/, '').split('/');
  const sketch = sketches.find((s) => s.slug === slug);
  if (!sketch) return showGallery();

  const seed = Number(seedParam) || newSeed();
  history.replaceState(null, '', `#/${slug}/${seed}`);
  showSketch(sketch, seed);
}

function showGallery() {
  document.title = 'MindScratch';
  app.innerHTML = `
    <main class="gallery">
      <h1>MindScratch</h1>
      <ul>
        ${sketches.map((s) => `<li><a href="#/${s.slug}">${s.title}</a></li>`).join('')}
      </ul>
    </main>`;
}

function showSketch(sketch, seed) {
  document.title = `${sketch.title} · MindScratch`;
  const hud = `
    <nav class="hud">
      <a href="#/">← back</a>
      <span>${sketch.title} · ${seed}</span>
      <span class="hint">R reseed · S save</span>
    </nav>`;
  app.innerHTML = `<canvas class="stage"></canvas>${background ? '' : hud}`;
  const canvas = app.querySelector('canvas');
  current = { sketch, seed, canvas, stop: run(canvas, sketch, seed) };
}

window.addEventListener('keydown', (e) => {
  if (!current || e.metaKey || e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (key === 'r') {
    history.replaceState(null, '', `#/${current.sketch.slug}/${newSeed()}`);
    render();
  } else if (key === 's') {
    const link = document.createElement('a');
    link.download = `${current.sketch.slug}-${current.seed}.png`;
    link.href = current.canvas.toDataURL('image/png');
    link.click();
  }
});

window.addEventListener('hashchange', render);
render();
