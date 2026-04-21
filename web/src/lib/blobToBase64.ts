/** Browser-sikker base64 fra Blob (store PDF’er uden stack overflow). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const dataUrl = r.result as string
      const i = dataUrl.indexOf(',')
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
