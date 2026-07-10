import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { execSync } from 'node:child_process'
import path from 'node:path'

const CPH = 'Europe/Copenhagen'

/** Release-id til Sentry: Netlify-commit, ellers git-SHA, ellers 'dev'. */
function gitRelease(): string {
  const fromCi = process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA
  if (fromCi) return fromCi.slice(0, 12)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

const SENTRY_RELEASE = gitRelease()
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN

/** Kort build-stempel til platform-UI (København — uanset server/dev-maskine). */
function platformBuildStamp(): string {
  const d = new Date()
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: CPH,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    f.formatToParts(d).map((p) => [p.type, p.value]),
  ) as { day: string; month: string; year: string; hour: string; minute: string }
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Upload kun sourcemaps når et auth-token er sat (fx i Netlify-build) —
    // så lokale builds ikke fejler eller uploader.
    ...(SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: SENTRY_AUTH_TOKEN,
            release: { name: SENTRY_RELEASE },
            // Slet uploadede sourcemaps fra dist, så de ikke serveres offentligt.
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // 'hidden': generér sourcemaps til upload, men referér dem ikke i bundtet.
  build: { sourcemap: 'hidden' },
  define: {
    __PLATFORM_BUILD__: JSON.stringify(platformBuildStamp()),
    __SENTRY_RELEASE__: JSON.stringify(SENTRY_RELEASE),
  },
})
