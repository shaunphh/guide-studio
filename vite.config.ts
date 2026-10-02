import { defineConfig } from 'vite'

// Built for GitHub Pages, where it's served from /guide-studio/ (the repo's name); `vite preview` serves the
// build the same way. The dev server stays at the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? process.env.BASE_PATH ?? '/guide-studio/' : '/',
  server: { host: '127.0.0.1', port: 5193, strictPort: true },
}))
