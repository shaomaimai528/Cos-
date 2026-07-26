import { useState } from 'react'

export function useClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  const copy = async (id: string, text: string) => {
    let success = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        success = true
      } else {
        const textarea = document.createElement('textarea')
        const activeElement = document.activeElement as HTMLElement | null
        textarea.value = text
        textarea.readOnly = true
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '0'
        document.body.appendChild(textarea)
        textarea.select()
        success = document.execCommand('copy')
        textarea.remove()
        activeElement?.focus()
      }
    } catch {
      success = false
    }

    if (success) {
      setFailedId(null)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1800)
    } else {
      setCopiedId(null)
      setFailedId(id)
      window.setTimeout(() => setFailedId((current) => (current === id ? null : current)), 2200)
    }
    return success
  }

  return { copy, copiedId, failedId }
}
