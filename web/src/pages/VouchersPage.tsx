import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { formatDateTime } from '@/lib/format'
import type { Database } from '@/types/database'

type Voucher = Database['public']['Tables']['vouchers']['Row']

export function VouchersPage() {
  const { currentCompany, user } = useApp()
  const [rows, setRows] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!currentCompany) return
    const { data } = await supabase
      .from('vouchers')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('uploaded_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [currentCompany])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentCompany || !user) return
    setUploading(true)
    setError(null)
    const path = `${currentCompany.id}/${crypto.randomUUID()}-${file.name}`
    const { error: upErr } = await supabase.storage
      .from('vouchers')
      .upload(path, file, { upsert: false })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      e.target.value = ''
      return
    }
    const { error: dbErr } = await supabase.from('vouchers').insert({
      company_id: currentCompany.id,
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      title: title || file.name,
      category: category || null,
      uploaded_by: user.id,
    })
    if (dbErr) {
      setError(dbErr.message)
      setUploading(false)
      e.target.value = ''
      return
    }
    await logActivity(currentCompany.id, 'voucher_upload', `Bilag uploadet: ${file.name}`)
    setTitle('')
    setCategory('')
    e.target.value = ''
    setUploading(false)
    await load()
  }

  async function openSigned(v: Voucher) {
    const { data, error: err } = await supabase.storage
      .from('vouchers')
      .createSignedUrl(v.storage_path, 3600)
    if (err || !data?.signedUrl) {
      setError(err?.message ?? 'Kunne ikke åbne fil')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Vælg virksomhed.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bilag</h1>
        <p className="text-sm text-slate-600">
          Upload kvitteringer og bilag — kun synlige for denne virksomhed
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Upload</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-500">Titel (valgfrit)</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Kategori (valgfrit)</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Fx rejse"
            />
          </div>
          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {uploading ? 'Uploader…' : 'Vælg fil'}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void onFile(e)}
              />
            </label>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Fil</th>
              <th className="px-4 py-3">Titel</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Uploadet</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Indlæser…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Ingen bilag endnu.
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {v.filename}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{v.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.category ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(v.uploaded_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-medium text-indigo-600 hover:underline"
                      onClick={() => void openSigned(v)}
                    >
                      Åbn
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
