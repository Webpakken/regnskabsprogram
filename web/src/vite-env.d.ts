/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_PUSH_PUBLIC_KEY?: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __PLATFORM_BUILD__: string
declare const __SENTRY_RELEASE__: string
