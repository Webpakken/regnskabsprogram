/**
 * SEO-indstillinger for marketing-forsiden (gemmes i platform_public_settings.landing_seo).
 */
export type LandingSeoSettings = {
  document_title: string
  meta_description: string
  meta_keywords: string
  og_title: string
  og_description: string
  og_image_url: string
  og_type: string
  og_site_name: string
  twitter_card: string
  canonical_url: string
  robots: string
  theme_color: string
  /** Rå JSON-LD (fx Organization); tom = ingen script */
  json_ld: string
}

export const DEFAULT_LANDING_SEO: LandingSeoSettings = {
  document_title: 'Bilago — dansk regnskab for SMB',
  meta_description:
    'Bilago samler fakturering, bilag og bank-afstemning for danske virksomheder — med CVR-opslag, moms og bogføringslov.',
  meta_keywords:
    'regnskab, faktura, bilag, bogføring, Danmark, SMB, moms, CVR, bogføringslov',
  og_title: 'Bilago — regnskab uden bøvl',
  og_description:
    'Fakturering, bilag og bank ét sted. Bygget til danske virksomheder.',
  og_image_url: 'https://bilago.dk/og-image.png',
  og_type: 'website',
  og_site_name: 'Bilago',
  twitter_card: 'summary_large_image',
  canonical_url: 'https://bilago.dk/',
  robots: 'index, follow',
  theme_color: '#4f46e5',
  json_ld: '',
}

export function mergeLandingSeo(raw: unknown): LandingSeoSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const str = (k: keyof LandingSeoSettings, fallback: string) => {
    const v = o[k as string]
    return typeof v === 'string' ? v : fallback
  }
  return {
    document_title: str('document_title', DEFAULT_LANDING_SEO.document_title),
    meta_description: str('meta_description', DEFAULT_LANDING_SEO.meta_description),
    meta_keywords: str('meta_keywords', DEFAULT_LANDING_SEO.meta_keywords),
    og_title: str('og_title', DEFAULT_LANDING_SEO.og_title),
    og_description: str('og_description', DEFAULT_LANDING_SEO.og_description),
    og_image_url: str('og_image_url', DEFAULT_LANDING_SEO.og_image_url),
    og_type: str('og_type', DEFAULT_LANDING_SEO.og_type),
    og_site_name: str('og_site_name', DEFAULT_LANDING_SEO.og_site_name),
    twitter_card: str('twitter_card', DEFAULT_LANDING_SEO.twitter_card),
    canonical_url: str('canonical_url', DEFAULT_LANDING_SEO.canonical_url),
    robots: str('robots', DEFAULT_LANDING_SEO.robots),
    theme_color: str('theme_color', DEFAULT_LANDING_SEO.theme_color),
    json_ld: str('json_ld', DEFAULT_LANDING_SEO.json_ld),
  }
}

const MARK = 'data-bilago-landing-seo'

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  const sel = `meta[${attr}="${key}"][${MARK}]`
  let el = document.head.querySelector(sel) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute(MARK, '1')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLinkCanonical(href: string) {
  const sel = `link[rel="canonical"][${MARK}]`
  let el = document.head.querySelector(sel) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    el.setAttribute(MARK, '1')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function setJsonLd(raw: string) {
  const sel = `script[type="application/ld+json"][${MARK}]`
  const existing = document.head.querySelector(sel)
  if (existing) existing.remove()
  const t = raw.trim()
  if (!t) return
  try {
    JSON.parse(t)
  } catch {
    return
  }
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.setAttribute(MARK, '1')
  script.textContent = t
  document.head.appendChild(script)
}

/** Anvend SEO i <head> (kald fra forsiden). Returnerer cleanup ved unmount. */
export function applyLandingSeoToDocument(seo: LandingSeoSettings): () => void {
  const prevTitle = document.title
  document.title = seo.document_title.trim() || DEFAULT_LANDING_SEO.document_title
  document.documentElement.lang = 'da'

  setMeta('name', 'description', seo.meta_description)
  if (seo.meta_keywords.trim()) {
    setMeta('name', 'keywords', seo.meta_keywords)
  } else {
    document.head.querySelector(`meta[name="keywords"][${MARK}]`)?.remove()
  }
  setMeta('property', 'og:title', seo.og_title)
  setMeta('property', 'og:description', seo.og_description)
  if (seo.og_image_url.trim()) {
    setMeta('property', 'og:image', seo.og_image_url)
  }
  setMeta('property', 'og:type', seo.og_type)
  setMeta('property', 'og:site_name', seo.og_site_name)
  setMeta('property', 'og:url', seo.canonical_url)
  setMeta('name', 'twitter:card', seo.twitter_card)
  setMeta('name', 'twitter:title', seo.og_title)
  setMeta('name', 'twitter:description', seo.og_description)
  if (seo.og_image_url.trim()) {
    setMeta('name', 'twitter:image', seo.og_image_url)
  }
  setMeta('name', 'robots', seo.robots)
  if (seo.theme_color.trim()) {
    setMeta('name', 'theme-color', seo.theme_color)
  }
  setLinkCanonical(seo.canonical_url.trim() || DEFAULT_LANDING_SEO.canonical_url)
  setJsonLd(seo.json_ld)

  return () => {
    document.title = prevTitle
    document.head.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove())
  }
}
