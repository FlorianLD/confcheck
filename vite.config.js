import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  // Repo name as base so asset URLs work under https://<user>.github.io/confcheck/
  base: '/confcheck/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
