import { defineConfig } from '@adonisjs/inertia'
export default defineConfig({
  rootView: 'inertia_layout',
  ssr: { enabled: false, entrypoint: 'inertia/ssr.tsx' },
})
