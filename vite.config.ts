import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/docter_manege_system/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 预缓存所有构建产物（含 index.html），安装 SW 时一次性缓存完毕
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,html}'],
        cleanupOutdatedCaches: true,
        // SPA 回退：所有导航请求离线时返回 index.html
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // JS/CSS：缓存优先，后台静默更新
            urlPattern: /\.(?:js|css)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // 图片/字体：长期缓存
            urlPattern: /\.(?:png|svg|ico|jpg|webp|woff2)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: '住院医师日程管家',
        short_name: '日程管家',
        description: '面向住院医师的本地离线日程管理系统',
        theme_color: '#3B82F6',
        background_color: '#F9FAFB',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
