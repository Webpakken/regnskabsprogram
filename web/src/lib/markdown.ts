/**
 * Minimal, sikker markdown → HTML til Maria-chatbeskeder.
 * Understøtter **fed**, *kursiv*, `kode`, links, og nummererede/punkt-lister.
 * HTML escapes FØRST, så AI-output aldrig kan injicere markup.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(s: string): string {
  let out = escapeHtml(s)
  // Links: [tekst](url) — kun http(s), åbnes i ny fane.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline">${text}</a>`,
  )
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  return out
}

export function mdToHtml(md: string): string {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        html.push('<ol class="list-decimal pl-5 space-y-1">')
        listType = 'ol'
      }
      html.push(`<li>${inline(ol[1])}</li>`)
    } else if (ul) {
      if (listType !== 'ul') {
        closeList()
        html.push('<ul class="list-disc pl-5 space-y-1">')
        listType = 'ul'
      }
      html.push(`<li>${inline(ul[1])}</li>`)
    } else if (line.trim() === '') {
      closeList()
    } else {
      closeList()
      html.push(`<p>${inline(line)}</p>`)
    }
  }
  closeList()
  return html.join('')
}
