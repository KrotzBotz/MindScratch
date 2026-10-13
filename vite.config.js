import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built site works from any subfolder (e.g. GitHub Pages).
  base: './',
  // 5180 by default; a PORT from the environment (e.g. a preview tool) takes priority.
  server: { port: Number(process.env.PORT) || 5180 },
});
