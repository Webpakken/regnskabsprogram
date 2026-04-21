import { supabase } from '@/lib/supabase'

/** Henter logo som data-URL til jsPDF (signed URL + fetch). */
export async function fetchCompanyLogoDataUrl(
  storagePath: string | null | undefined,
): Promise<string | null> {
  if (!storagePath?.trim()) return null
  const { data, error } = await supabase.storage
    .from('company-logos')
    .createSignedUrl(storagePath.trim(), 3600)
  if (error || !data?.signedUrl) return null
  try {
    const res = await fetch(data.signedUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => reject(new Error('read'))
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
