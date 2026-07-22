import { defineConfig } from 'vite';

export default defineConfig({
  // Relative, not '/' — GitHub Pages project sites serve from a subpath
  // (e.g. /gcode-review/), and '/' would point built assets at domain root
  // instead, 404ing on every load. Relative paths work under any subpath,
  // a custom domain, or a user/org page, with no per-repo config needed.
  base: './',
  worker: {
    format: 'es',
  },
});
