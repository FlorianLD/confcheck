import JSZip from 'jszip'

const TARGET_BASE_NAMES = new Set(['rulesets', 'stock_requests', 'delivery_configs'])
const MAX_FILES = 4

function stripJsonc(text) {
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    const next = text[i + 1]

    if (c === '"') {
      out += c
      i++
      while (i < n) {
        const ch = text[i]
        out += ch
        if (ch === '\\' && i + 1 < n) {
          out += text[i + 1]
          i += 2
          continue
        }
        i++
        if (ch === '"') break
      }
      continue
    }

    if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i++
      continue
    }

    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }

    out += c
    i++
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

function matchTarget(fileName) {
  const m = /^(.+)\.(jsonc?|JSONC?)$/.exec(fileName)
  if (!m) return null
  const base = m[1]
  if (!TARGET_BASE_NAMES.has(base)) return null
  return { base, isJsonc: m[2].toLowerCase() === 'jsonc' }
}

async function parseEnvZip(file) {
  const zip = await JSZip.loadAsync(file)
  const data = {}
  let info = null

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const parts = path.split(/[\/\\]/).filter(Boolean)
    const fileName = parts[parts.length - 1]

    if (fileName === 'export.info') {
      try {
        const raw = await entry.async('string')
        info = JSON.parse(raw)
      } catch (err) {
        console.warn(`Failed to parse ${path} in ${file.name}: ${err.message}`)
      }
      continue
    }

    const target = matchTarget(fileName)
    if (!target) continue

    const raw = await entry.async('string')
    const text = target.isJsonc ? stripJsonc(raw) : raw
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      throw new Error(`Failed to parse ${path} in ${file.name}: ${err.message}`)
    }
    data[target.base] = parsed
  }

  if (Object.keys(data).length === 0) {
    throw new Error(`${file.name} contains no rulesets / stock_requests / delivery_configs files.`)
  }

  const envName = (info && typeof info.environment === 'string' && info.environment.trim())
    ? info.environment.trim()
    : file.name.replace(/\.zip$/i, '')

  return { envName, data, info, fileName: file.name }
}

export async function parseZips(files) {
  const list = Array.from(files || []).filter(f => /\.zip$/i.test(f.name))
  if (list.length === 0) {
    throw new Error('Please drop at least one .zip file.')
  }
  if (list.length > MAX_FILES) {
    throw new Error(`Too many files (${list.length}). Drop up to ${MAX_FILES} zip files at once.`)
  }

  const bundles = await Promise.all(list.map(parseEnvZip))

  const envs = {}
  const sites = {}
  for (const b of bundles) {
    if (envs[b.envName]) {
      throw new Error(`Duplicate environment "${b.envName}" (in ${b.fileName}). Each zip must be a different environment.`)
    }
    envs[b.envName] = b.data
    if (b.info) {
      sites[b.envName] = {
        site_id: b.info.site_id ?? null,
        site_name: b.info.site_name ?? null,
      }
    }
  }

  const siteIdByEnv = {}
  for (const [envName, s] of Object.entries(sites)) {
    if (s.site_id != null && String(s.site_id).trim() !== '') {
      siteIdByEnv[envName] = String(s.site_id)
    }
  }
  const distinctSiteIds = new Set(Object.values(siteIdByEnv))
  if (distinctSiteIds.size > 1) {
    const detail = Object.entries(siteIdByEnv).map(([env, id]) => `${env} = ${id}`).join(', ')
    throw new Error(`Site IDs do not match across environments (${detail}). All zips must share the same site_id.`)
  }

  let siteId = null
  let siteName = null
  for (const s of Object.values(sites)) {
    if (siteId == null && s.site_id != null && String(s.site_id).trim() !== '') {
      siteId = s.site_id
    }
    if (siteName == null && s.site_name != null && String(s.site_name).trim() !== '') {
      siteName = s.site_name
    }
  }
  const site = (siteId != null || siteName != null) ? { site_id: siteId, site_name: siteName } : null

  return { envs, sites, site }
}

export const MAX_ZIP_FILES = MAX_FILES
