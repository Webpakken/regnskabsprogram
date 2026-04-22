import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const CPH = 'Europe/Copenhagen'

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
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  define: {
    __PLATFORM_BUILD__: JSON.stringify(platformBuildStamp()),
  },
})
