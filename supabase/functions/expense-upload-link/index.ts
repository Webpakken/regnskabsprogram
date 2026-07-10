import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

type LinkRow = {
  id: string
  company_id: string
  mode: 'single_use' | 'time_window'
  expires_at: string
  max_uploads: number | null
  used_count: number
  revoked_at: string | null
}

function errMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

function isLinkUsable(link: LinkRow): boolean {
  if (link.revoked_at) return false
  if (new Date(link.expires_at).getTime() <= Date.now()) return false
  if (link.max_uploads !== null && link.used_count >= link.max_uploads) return false
  return true
}

function base64ToBytes(input: string): Uint8Array {
  const bin = atob(input)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

serveWithSentry('expense-upload-link', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const body = await req.json() as {
      action?: 'info' | 'upload'
      token?: string
      file_name?: string
      mime_type?: string
      file_base64?: string
      requester_name?: string
      phone?: string
      bank_reg_number?: string
      bank_account_number?: string
      title?: string
      category?: string | null
      notes?: string | null
      expense_date?: string
      gross_cents?: number
      net_cents?: number
      vat_cents?: number
      vat_rate?: number
    }

    const token = body.token?.trim()
    if (!token) return jsonResponse({ error: 'Token mangler.' }, 400)
    const tokenHash = await sha256Hex(token)

    const { data: link, error: linkErr } = await admin
      .from('expense_upload_links')
      .select('id, company_id, mode, expires_at, max_uploads, used_count, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle<LinkRow>()
    if (linkErr || !link) return jsonResponse({ error: 'Linket findes ikke.' }, 404)
    if (!isLinkUsable(link)) {
      return jsonResponse({ error: 'Linket er udløbet eller allerede brugt.' }, 410)
    }

    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', link.company_id)
      .maybeSingle()

    if (body.action === 'info') {
      return jsonResponse({
        company_name: company?.name ?? 'Virksomheden',
        mode: link.mode,
        expires_at: link.expires_at,
        remaining_uploads:
          link.max_uploads === null ? null : Math.max(0, link.max_uploads - link.used_count),
      })
    }

    if (body.action !== 'upload') {
      return jsonResponse({ error: 'Ukendt handling.' }, 400)
    }

    const requesterName = body.requester_name?.trim()
    if (!requesterName) return jsonResponse({ error: 'Navn er påkrævet.' }, 400)
    if (!body.file_base64 || !body.file_name) {
      return jsonResponse({ error: 'Bilag mangler.' }, 400)
    }

    const fileName = body.file_name.trim().slice(0, 180) || 'bilag'
    const mimeType = body.mime_type?.trim() || 'application/octet-stream'
    const bytes = base64ToBytes(body.file_base64)
    if (bytes.byteLength > 12 * 1024 * 1024) {
      return jsonResponse({ error: 'Filen er for stor. Maks. 12 MB.' }, 413)
    }

    const path = `${link.company_id}/expense-links/${crypto.randomUUID()}-${fileName}`
    const { error: uploadErr } = await admin.storage
      .from('vouchers')
      .upload(path, bytes, { contentType: mimeType, upsert: false })
    if (uploadErr) return jsonResponse({ error: uploadErr.message }, 500)

    const grossCents = Math.max(0, Math.round(Number(body.gross_cents ?? 0)))
    const vatRate = Number.isFinite(body.vat_rate) ? Number(body.vat_rate) : 25
    const netCents = Math.max(
      0,
      Math.round(Number(body.net_cents ?? (vatRate > 0 ? grossCents / (1 + vatRate / 100) : grossCents))),
    )
    const vatCents = Math.max(0, Math.round(Number(body.vat_cents ?? grossCents - netCents)))
    const expenseDate = body.expense_date?.trim() || new Date().toISOString().slice(0, 10)

    const { data: voucher, error: voucherErr } = await admin
      .from('vouchers')
      .insert({
        company_id: link.company_id,
        storage_path: path,
        filename: fileName,
        mime_type: mimeType,
        title: body.title?.trim() || fileName.replace(/\.[^.]+$/, ''),
        category: body.category ?? null,
        notes: body.notes?.trim() || null,
        uploaded_by: null,
        expense_date: expenseDate,
        gross_cents: grossCents,
        net_cents: netCents,
        vat_cents: vatCents,
        vat_rate: vatRate,
      })
      .select('id')
      .single()
    if (voucherErr || !voucher) return jsonResponse({ error: voucherErr?.message ?? 'Bilag kunne ikke gemmes.' }, 500)

    const { error: reimbursementErr } = await admin
      .from('voucher_reimbursements')
      .insert({
        voucher_id: voucher.id,
        company_id: link.company_id,
        upload_link_id: link.id,
        requester_name: requesterName,
        phone: body.phone?.trim() || null,
        bank_reg_number: body.bank_reg_number?.trim() || null,
        bank_account_number: body.bank_account_number?.trim() || null,
        status: 'pending_approval',
      })
    if (reimbursementErr) return jsonResponse({ error: reimbursementErr.message }, 500)

    const { error: updateErr } = await admin
      .from('expense_upload_links')
      .update({ used_count: link.used_count + 1, updated_at: new Date().toISOString() })
      .eq('id', link.id)
    if (updateErr) console.warn('expense_upload_links used_count update failed', updateErr.message)

    return jsonResponse({ ok: true, voucher_id: voucher.id })
  } catch (e) {
    console.error('expense-upload-link error', errMessage(e), e)
    return jsonResponse({ error: errMessage(e) }, 500)
  }
})
