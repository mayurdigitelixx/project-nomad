import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import adonisjs from '@adonisjs/vite/client'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    adonisjs({ entryPoints: ['inertia/app.tsx'], reload: ['resources/views/**/*.edge'] }),
  ],

  /**
   * Define aliases for importing modules from
   * your frontend code
   */
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
    },
  },
  server: {
    allowedHosts: true, // This is for dev environments only. Can be overriden with `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` if needed.
  },
})
