/** Fælles HTML-ramme — matcher Bilago (indigo + slate), inline CSS til e-mail-klienter. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v)
  }
  return out
}

export function wrapBilagoEmail(innerHtml: string, preheader?: string): string {
  const pre = preheader
    ? `<div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>`
    : ''
  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${pre}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:24px 28px;">
            <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Bilago</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Dansk SMB-regnskab</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 32px;color:#0f172a;font-size:15px;line-height:1.6;">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5;">
            Denne mail er sendt fra Bilago. Har du spørgsmål, svar venligst på denne e-mail eller kontakt support via din konto.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
