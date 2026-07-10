/** Genbrugelig til/fra-række til notifikationsindstillinger (kunde + platform). */
export function NotificationToggleRow(props: {
  id: string
  title: string
  body: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  const { id, title, body, checked, disabled, onChange } = props
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
