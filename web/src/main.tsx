import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RootErrorBoundary } from './RootErrorBoundary.tsx'
import { initSentry } from '@/lib/sentry'

initSentry()

const registerServiceWorker =
  import.meta.env.PROD || Boolean(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim())

if (registerServiceWorker && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[service worker]', err)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
