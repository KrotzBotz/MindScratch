import './style.css';
import { run } from './lib/run.js';

// Every file in src/sketches/ is picked up automatically; the filename is the URL slug.
const modules = import.meta.glob('./sketches/*.js', { eager: true });
const sketches = Object.entries(modules)
  .map(([path, mod]) => ({ slug: path.match(/([^/]+)\.js$/)[1], ...mod.default }))
  .sort((a, b) => a.title.localeCompare(b.title));

const app = document.getElementById('app');
let current = null; // { sketch, route, seed, canvas, stop }

// ?bg hides the cursor, for using a sketch as a background.
document.body.classList.toggle('bg', new URLSearchParams(location.search).has('bg'));

const newSeed = () => Math.floor(Math.random() * 1e9);

// Routes: #/ is the gallery, #/<slug>/<seed> is a sketch, and #/our-constellation/<seed> is Two
// Minds with a Google search box, for use as a start page. The seed lives in the URL so a reload (including
// Vite's reload on save) redraws the same piece.
function render() {
  current?.stop();
  current = null;

  const [route, seedParam] = location.hash.replace(/^#\/?/, '').split('/');
  const search = route === 'our-constellation';
  const sketch = sketches.find((s) => s.slug === (search ? 'two-minds' : route));
  if (!sketch) return showGallery();

  const seed = Number(seedParam) || newSeed();
  history.replaceState(null, '', `#/${route}/${seed}`);
  showSketch(sketch, route, seed, search);
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

function showSketch(sketch, route, seed, search) {
  document.title = search ? 'Our Constellation' : `${sketch.title} · MindScratch`;
  app.innerHTML = `
    <canvas class="stage"></canvas>
    ${search ? `
      <form class="search" action="https://www.google.com/search" role="search">
        <input name="q" type="search" placeholder="Search Google" aria-label="Search Google" autocomplete="off">
      </form>` : ''}`;
  app.querySelector('.search input')?.focus();
  const canvas = app.querySelector('canvas');
  current = { sketch, route, seed, canvas, stop: run(canvas, sketch, seed) };
}

window.addEventListener('keydown', (e) => {
  if (!current || e.metaKey || e.ctrlKey || e.target.closest?.('input')) return;
  const key = e.key.toLowerCase();
  if (key === 'r') {
    history.replaceState(null, '', `#/${current.route}/${newSeed()}`);
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
