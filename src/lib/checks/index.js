import generalChecks from './general.js'
import c1180Checks from './sites/c1180.js'

const CATEGORIES = {
  rulesets: 'Rulesets',
  stock_requests: 'Stock requests',
  delivery_configs: 'Delivery configs',
}

// Per-site test bundles, keyed by site_id (string).
const SITE_CHECKS = {
  c1180: c1180Checks,
}

function getChecksForSite(siteId) {
  const siteChecks = (siteId != null && SITE_CHECKS[String(siteId)]) || []
  const tagged = siteChecks.map(c => ({ ...c, siteScope: String(siteId) }))
  return [...generalChecks, ...tagged]
}

function defaultLinkPath(category, elementId) {
  const first = elementId.split(' → ')[0]
  if (category === 'delivery_configs') return '/delivery/current/configs'
  if (category === 'stock_requests') return `/config/request/stock/${first}`
  if (category === 'rulesets') return `/rulesets/rules/set/${first}/current`
  return null
}

export function runChecks(envs, siteId) {
  const checks = getChecksForSite(siteId)
  const aggregator = new Map()

  for (const [envName, envData] of Object.entries(envs)) {
    for (const c of checks) {
      let failures = []
      try {
        failures = c.run(envData) || []
      } catch (err) {
        console.error(`Check ${c.id} failed on env ${envName}:`, err)
      }
      for (const f of failures) {
        const key = `${c.category}\u0000${c.id}\u0000${f.id}`
        let entry = aggregator.get(key)
        if (!entry) {
          entry = {
            category: c.category,
            categoryLabel: CATEGORIES[c.category],
            checkId: c.id,
            checkLabel: c.label,
            checkSiteScope: c.siteScope ?? null,
            elementId: f.id,
            linkPath: f.linkPath ?? defaultLinkPath(c.category, f.id),
            envs: new Set(),
          }
          aggregator.set(key, entry)
        }
        entry.envs.add(envName)
      }
    }
  }

  const byCategory = new Map()
  for (const entry of aggregator.values()) {
    if (!byCategory.has(entry.category)) {
      byCategory.set(entry.category, {
        id: entry.category,
        label: entry.categoryLabel,
        tests: new Map(),
      })
    }
    const cat = byCategory.get(entry.category)
    if (!cat.tests.has(entry.checkId)) {
      cat.tests.set(entry.checkId, {
        id: entry.checkId,
        label: entry.checkLabel,
        siteScope: entry.checkSiteScope,
        failures: [],
      })
    }
    cat.tests.get(entry.checkId).failures.push({
      elementId: entry.elementId,
      linkPath: entry.linkPath,
      envs: [...entry.envs].sort(),
    })
  }

  const orderedCats = ['rulesets', 'stock_requests', 'delivery_configs']
  return orderedCats
    .filter(cid => byCategory.has(cid))
    .map(cid => {
      const cat = byCategory.get(cid)
      return {
        id: cat.id,
        label: cat.label,
        tests: [...cat.tests.values()]
          .map(t => ({
            ...t,
            failures: t.failures.sort((a, b) => a.elementId.localeCompare(b.elementId)),
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }
    })
}

export function totalFailures(results) {
  let n = 0
  for (const cat of results) for (const t of cat.tests) n += t.failures.length
  return n
}
