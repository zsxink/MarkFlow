import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === 'analyze'
      ? visualizer({
          filename: 'docs/bundle-report.html',
          gzipSize: true,
          brotliSize: false,
        })
      : null,
  ].filter(Boolean),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-prosemirror': [
            '@tiptap/core',
            '@tiptap/starter-kit',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-task-list',
            '@tiptap/extension-task-item',
            '@tiptap/extension-table',
            '@tiptap/extension-table-row',
            '@tiptap/extension-table-cell',
            '@tiptap/extension-table-header',
            '@tiptap/extension-link',
            '@tiptap/extension-image',
            '@tiptap/extension-code-block-lowlight',
            'tiptap-markdown',
            'prosemirror-model',
            'prosemirror-state',
            'prosemirror-view',
            'prosemirror-schema-list',
            'prosemirror-inputrules',
          ],
          'vendor-codemirror': [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/autocomplete',
            'codemirror',
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      '@tiptap/core',
      '@tiptap/starter-kit',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-task-list',
      '@tiptap/extension-task-item',
      '@tiptap/extension-table',
      '@tiptap/extension-table-row',
      '@tiptap/extension-table-cell',
      '@tiptap/extension-table-header',
      '@tiptap/extension-link',
      '@tiptap/extension-image',
      '@tiptap/extension-code-block-lowlight',
      'tiptap-markdown',
      'lowlight',
    ],
  },
}));
