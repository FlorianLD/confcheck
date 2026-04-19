import LZString from 'lz-string'

const VERSION = 1

export function encodeShare({ results, allEnvs, site }) {
  const payload = { v: VERSION, results, allEnvs, site }
  const json = JSON.stringify(payload)
  return LZString.compressToEncodedURIComponent(json)
}

export function decodeShare(encoded) {
  if (!encoded) return null
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const obj = JSON.parse(json)
    if (obj?.v !== VERSION) return null
    if (!Array.isArray(obj.results) || !Array.isArray(obj.allEnvs)) return null
    return { results: obj.results, allEnvs: obj.allEnvs, site: obj.site || null }
  } catch {
    return null
  }
}

export function buildShareUrl(state) {
  const encoded = encodeShare(state)
  return `${window.location.origin}${window.location.pathname}#v=${encoded}`
}

export function readShareFromUrl() {
  const hash = (typeof window !== 'undefined' && window.location.hash) || ''
  const m = /^#v=(.+)$/.exec(hash)
  if (!m) return null
  return decodeShare(m[1])
}

export function clearShareHash() {
  if (typeof window === 'undefined') return
  if (window.location.hash) {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
  }
}

