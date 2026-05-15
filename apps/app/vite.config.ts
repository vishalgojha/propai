import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const manualChunks = (id: string) => {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
    return 'react-vendor';
  }

  if (id.includes('/framer-motion/') || id.includes('/motion/')) {
    return 'motion-vendor';
  }

  if (id.includes('/@supabase/')) {
    return 'supabase-vendor';
  }

  if (id.includes('/axios/')) {
    return 'http-vendor';
  }

  if (id.includes('/lucide-react/')) {
    return 'icon-vendor';
  }

  if (id.includes('/@google/genai/')) {
    return 'ai-vendor';
  }

  if (id.includes('/posthog-js/')) {
    return 'analytics-vendor';
  }

  return undefined;
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
