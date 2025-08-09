import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Update site and base when you know your GitHub Pages URL/repo.
// If deploying to https://<user>.github.io/<repo>/ then set base: '/<repo>' and site to the full URL.
export default defineConfig({
  // site: 'https://<your-user>.github.io',
  // base: '/<your-repo>',
  integrations: [react(), tailwind({ applyBaseStyles: false })],
  prefetch: true
});

