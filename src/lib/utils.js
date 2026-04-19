const KNOWN_COUNTRIES = new Set([
  'gb', 'it', 'ie', 'fr', 'de', 'es', 'nl', 'be', 'pt', 'pl', 'us', 'ca', 'au', 'jp',
])

const IGNORED_STOCK_REQUEST_IDS = new Set([
  'dp_detailed',
  'orchestration_detailed',
  'export_detailed',
  'detailed',
  'in_stock',
])

export function isIgnoredStockRequest(srId) {
  return IGNORED_STOCK_REQUEST_IDS.has(srId)
}

const COUNTRY_TAG_ALIASES = { uk: 'gb' }

export function normalizeCountry(code) {
  if (!code) return null
  const lower = String(code).toLowerCase()
  return COUNTRY_TAG_ALIASES[lower] || lower
}

export function extractCountryFromName(name) {
  if (!name) return null
  const lower = name.toLowerCase()
  const tokens = lower.split(/[_\-\s.]+/)
  for (const token of tokens) {
    const candidate = normalizeCountry(token)
    if (candidate && KNOWN_COUNTRIES.has(candidate)) return candidate
  }
  return null
}

function walkFilters(filter, visit) {
  if (!filter || typeof filter !== 'object') return
  visit(filter)
  if (Array.isArray(filter.filters)) {
    for (const child of filter.filters) walkFilters(child, visit)
  }
  if (filter.filter && typeof filter.filter === 'object') {
    walkFilters(filter.filter, visit)
  }
}

export function getRuleEndpointType(rule) {
  let type = null
  walkFilters(rule?.filter, (f) => {
    if (f.type === 'group_tag' && f.group_id === 'endpoint_type') {
      type = f.tag_id
    }
  })
  return type
}

export function getRuleCountry(rule) {
  let country = null
  walkFilters(rule?.filter, (f) => {
    if (f.type === 'group_tag' && f.group_id === 'country') {
      country = normalizeCountry(f.tag_id)
    }
  })
  return country
}

export function getRuleEfficiencyValue(rule) {
  let val = null
  walkFilters(rule?.filter, (f) => {
    if (f.type === 'dynamic_tag' && f.tag_id === 'efficiency') {
      val = f.value
    }
  })
  return val
}

export function makeRuleFailure(rsId, rule, index) {
  return {
    id: `${rsId} → ${rule?.name || '(unnamed rule)'}`,
    linkPath: `/rulesets/rules/set/${rsId}/rule/${index + 1}/current`,
  }
}

export function isStoreRule(rule) {
  return getRuleEndpointType(rule) === 'store'
}

export function isWarehouseRule(rule) {
  return getRuleEndpointType(rule) === 'warehouse'
}

export function isCollectionStoreRule(rule) {
  return rule?.custom_action === 'claim_with_destination'
}

export function hasAutomaticWarehouseClaim(rule) {
  return rule?.custom_action === 'claim_with_endpoint' &&
    rule?.custom_action_params?.to_state === 'claimed_warehouse'
}

export function getRulesetRules(ruleset) {
  return ruleset?.value?.current_ruleset?.rules || []
}

export function getRulesetStockRequests(ruleset) {
  return ruleset?.value?.current_ruleset?.stock_requests || {}
}

export function getStockRequestBody(stockRequest) {
  return stockRequest?.value?.current?.body || {}
}

export function getStockRequestAggregates(stockRequest) {
  return getStockRequestBody(stockRequest).aggregates || {}
}

export function getStockRequestEndpointTypes(stockRequest) {
  const types = new Set()
  const aggregates = getStockRequestAggregates(stockRequest)
  for (const agg of Object.values(aggregates)) {
    const reqName = agg?.endpoint_filter?.request_name || ''
    if (reqName.startsWith('warehouses_') || reqName.startsWith('warehouse_')) {
      types.add('warehouse')
    } else if (reqName.startsWith('stores_') || reqName.startsWith('store_')) {
      types.add('store')
    } else if (reqName.startsWith('marketplace_')) {
      types.add('marketplace')
    }
  }
  return types
}

export function stockRequestHasEndpointTypeRecursive(stockRequestName, allStockRequests, type, seen = new Set()) {
  if (!stockRequestName || seen.has(stockRequestName)) return false
  seen.add(stockRequestName)
  const sr = allStockRequests?.[stockRequestName]
  if (!sr) return false
  if (getStockRequestEndpointTypes(sr).has(type)) return true
  const inherit = getStockRequestBody(sr).inherit_from_request
  if (inherit) {
    return stockRequestHasEndpointTypeRecursive(inherit, allStockRequests, type, seen)
  }
  return false
}

export function isUnifiedStockRequest(sr) {
  const n = (sr?.name || '').toLowerCase()
  return n.includes('unified')
}

export function isDetailedStockRequest(sr) {
  const n = (sr?.name || '').toLowerCase()
  return n.includes('detailed')
}

export function isExportStockRequest(sr) {
  const n = (sr?.name || '').toLowerCase()
  return n.startsWith('export_') || n.includes('_export_') || n.endsWith('_export')
}

export function endpointFilterRequestNames(sr) {
  const names = []
  for (const agg of Object.values(getStockRequestAggregates(sr))) {
    const n = agg?.endpoint_filter?.request_name
    if (n) names.push(n)
  }
  return names
}

export function isCkcStockRequest(sr) {
  if (!sr) return false
  const n = (sr.name || '').toLowerCase()
  if (n.includes('ckc')) return true
  for (const refName of endpointFilterRequestNames(sr)) {
    if (refName.toLowerCase().includes('ckc')) return true
  }
  return false
}

