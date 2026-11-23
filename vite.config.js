import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// The data backend is chosen at BUILD time by VITE_DATA_BACKEND:
//
//   (unset) | "supabase"   → src/lib/supabase.js      + src/lib/auth.jsx
//   "firestore"            → src/lib/firestore.js     + src/lib/authFirebase.jsx
//
// Both pairs export exactly the same names, so application code imports the
// aliases "@db" and "@auth" and never names a backend. Only one backend is
// bundled, so the unused SDK is not shipped and its env vars are not needed.
//
// Default is supabase ON PURPOSE: the Vercel deployment must keep building and
// running untouched while the GCP migration is validated in parallel. Cutting
// over is then a single env var, and rolling back is the same.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const firestore = env.VITE_DATA_BACKEND === 'firestore'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@db':   firestore ? '/src/lib/firestore.js'     : '/src/lib/supabase.js',
        '@auth': firestore ? '/src/lib/authFirebase.jsx' : '/src/lib/auth.jsx',
      },
    },
    define: {
      __DATA_BACKEND__: JSON.stringify(firestore ? 'firestore' : 'supabase'),
    },
  }
})
