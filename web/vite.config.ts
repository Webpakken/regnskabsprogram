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
const SENTRY_ORG = process.env.SENTRY_ORG
const SENTRY_PROJECT = process.env.SENTRY_PROJECT

/**
 * Sourcemap-upload kræver alle tre værdier. Tjekkes de ikke samlet, kører
 * pluginnet med org/project = undefined, hvis kun tokenet er sat — så fejler
 * uploaden og fælder hele buildet i CI, mens lokale builds er upåvirkede.
 */
const SENTRY_ENABLED = Boolean(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT)

if (SENTRY_AUTH_TOKEN && !SENTRY_ENABLED) {
  console.warn(
    '[vite] SENTRY_AUTH_TOKEN er sat, men SENTRY_ORG og/eller SENTRY_PROJECT mangler — ' +
      'springer sourcemap-upload over.',
  )
}

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
    // Upload kun sourcemaps når Sentry er fuldt konfigureret (fx i produktions-
    // build hos Hostinger) — så lokale builds og CI hverken fejler eller uploader.
    ...(SENTRY_ENABLED
      ? [
          sentryVitePlugin({
            org: SENTRY_ORG,
            project: SENTRY_PROJECT,
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
  // Uden Sentry-upload er de spildt arbejde — hovedbundtets sourcemap fylder
  // ~9 MB, og at droppe den sparer både byggetid og hukommelse på små CI-runnere.
  build: { sourcemap: SENTRY_ENABLED ? 'hidden' : false },
  define: {
    __PLATFORM_BUILD__: JSON.stringify(platformBuildStamp()),
    __SENTRY_RELEASE__: JSON.stringify(SENTRY_RELEASE),
  },
})
