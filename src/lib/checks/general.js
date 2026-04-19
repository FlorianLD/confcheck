import {
  extractCountryFromName,
  getRulesetRules,
  getRulesetStockRequests,
  isStoreRule,
  isWarehouseRule,
  isCollectionStoreRule,
  hasAutomaticWarehouseClaim,
  getRuleCountry,
  getStockRequestBody,
  getStockRequestAggregates,
  stockRequestHasEndpointTypeRecursive,
  isUnifiedStockRequest,
  isDetailedStockRequest,
  isExportStockRequest,
  isIgnoredStockRequest,
  endpointFilterRequestNames,
  isCkcStockRequest,
  makeRuleFailure,
} from '../utils.js'

const CHECKS = []

function check(category, id, label, run, meta) {
  CHECKS.push({ category, id, label, run, ...(meta || {}) })
}

// ---------------------------- RULESETS ----------------------------

check('rulesets', 'r_store_empty_calendars', 'Store rule must not have an empty calendar', (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const rules = getRulesetRules(ruleset)
    rules.forEach((rule, i) => {
      if (!isStoreRule(rule)) return
      const timespans = rule?.countdown_timetable?.current_timetable?.timespans
      const empty = !timespans || timespans.length === 0 ||
        timespans.every(ts => ts?.options?.rules_enabled === false)
      if (empty) fails.push(makeRuleFailure(rsId, rule, i))
    })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].filter',
    'value.current_ruleset.rules[].countdown_timetable.current_timetable.timespans[].options.rules_enabled',
  ],
})

check('rulesets', 'r_warehouse_no_auto_claim', "Warehouse rule must have automatic warehouse claim parameter", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const rules = getRulesetRules(ruleset)
    rules.forEach((rule, i) => {
      if (!isWarehouseRule(rule)) return
      if (!hasAutomaticWarehouseClaim(rule)) fails.push(makeRuleFailure(rsId, rule, i))
    })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].filter',
    'value.current_ruleset.rules[].custom_action',
    'value.current_ruleset.rules[].custom_action_params.to_state',
  ],
})

check('rulesets', 'r_warehouse_rules_no_warehouse_query', "Ruleset with warehouse rules must use a stock request with warehouse endpoint", (envData) => {
  const fails = []
  const allSr = envData.stock_requests?.stock_requests || {}
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const hasWarehouseRule = getRulesetRules(ruleset).some(isWarehouseRule)
    if (!hasWarehouseRule) continue
    const stockRequests = getRulesetStockRequests(ruleset)
    const refs = Object.values(stockRequests).filter(Boolean)
    if (refs.length === 0) continue
    const anyHasWarehouse = refs.some(name =>
      stockRequestHasEndpointTypeRecursive(name, allSr, 'warehouse'))
    if (!anyHasWarehouse) fails.push({ id: rsId })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].filter',
    'value.current_ruleset.stock_requests',
    'stock_requests.*.value.current.body.aggregates.*.endpoint_filter.request_name',
    'stock_requests.*.value.current.body.inherit_from_request',
  ],
})

check('rulesets', 'r_store_rules_no_store_query', "Ruleset with store rules must use a stock request with store endpoint", (envData) => {
  const fails = []
  const allSr = envData.stock_requests?.stock_requests || {}
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const hasStoreRule = getRulesetRules(ruleset).some(isStoreRule)
    if (!hasStoreRule) continue
    const stockRequests = getRulesetStockRequests(ruleset)
    const refs = Object.values(stockRequests).filter(Boolean)
    if (refs.length === 0) continue
    const anyHasStore = refs.some(name =>
      stockRequestHasEndpointTypeRecursive(name, allSr, 'store'))
    if (!anyHasStore) fails.push({ id: rsId })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].filter',
    'value.current_ruleset.stock_requests',
    'stock_requests.*.value.current.body.aggregates.*.endpoint_filter.request_name',
    'stock_requests.*.value.current.body.inherit_from_request',
  ],
})

check('rulesets', 'r_country_mismatch_query', "Country in rules must match country in stock request", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const ruleCountries = new Set(
      getRulesetRules(ruleset).map(getRuleCountry).filter(Boolean)
    )
    if (ruleCountries.size === 0) continue
    const stockRequests = getRulesetStockRequests(ruleset)
    const queryCountries = new Set(
      Object.values(stockRequests)
        .filter(Boolean)
        .map(name => extractCountryFromName(name))
        .filter(Boolean)
    )
    if (queryCountries.size === 0) continue
    const overlap = [...ruleCountries].some(c => queryCountries.has(c))
    if (!overlap) fails.push({ id: rsId })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].filter',
    'value.current_ruleset.stock_requests',
  ],
})

check('rulesets', 'r_store_no_timeout', "Store rule must have a timeout", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const rules = getRulesetRules(ruleset)
    rules.forEach((rule, i) => {
      if (!isStoreRule(rule)) return
      if (!rule.rule_timeout || rule.rule_timeout <= 0) fails.push(makeRuleFailure(rsId, rule, i))
    })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].filter',
    'value.current_ruleset.rules[].rule_timeout',
  ],
})

check('rulesets', 'r_collection_store_no_ckc', "Ruleset with automatic claiming on collection store must use a CKC-enabled stock request", (envData) => {
  const fails = []
  const allSr = envData.stock_requests?.stock_requests || {}
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const hasCollectionClaim = getRulesetRules(ruleset).some(isCollectionStoreRule)
    if (!hasCollectionClaim) continue
    const stockRequests = getRulesetStockRequests(ruleset)
    const refs = Object.values(stockRequests).filter(Boolean)
    const anyCkc = refs.some(name => isCkcStockRequest(allSr[name]))
    if (!anyCkc) fails.push({ id: rsId })
  }
  return fails
}, {
  fields: [
    'value.current_ruleset.rules[].custom_action',
    'value.current_ruleset.stock_requests',
    'stock_requests.*.name',
    'stock_requests.*.value.current.body.aggregates.*.endpoint_filter.request_name',
  ],
})

check('rulesets', 'r_country_name_mismatch', "Country in ruleset must match country in ruleset name", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const nameCountry = extractCountryFromName(rsId) || extractCountryFromName(ruleset?.name)
    if (!nameCountry) continue
    const ruleCountries = new Set(
      getRulesetRules(ruleset).map(getRuleCountry).filter(Boolean)
    )
    if (ruleCountries.size === 0) continue
    if (!ruleCountries.has(nameCountry)) {
      fails.push({ id: rsId })
    }
  }
  return fails
}, {
  fields: [
    'name',
    'value.current_ruleset.rules[].filter',
  ],
})

// ---------------------------- STOCK REQUESTS ----------------------------

check('stock_requests', 's_export_no_export_endpoint', "Export requests must use endpoint query with 'export' parameter", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isExportStockRequest(sr)) continue
    const endpoints = endpointFilterRequestNames(sr)
    if (endpoints.length === 0) continue
    const anyExport = endpoints.some(n => n.toLowerCase().includes('export'))
    if (!anyExport) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.aggregates.*.endpoint_filter.request_name',
  ],
})

check('stock_requests', 's_non_export_uses_export_endpoint', "Non-export requests must not use an export endpoint request", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const name = (sr.name || '').toLowerCase()
    if (name.startsWith('export_')) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const reqName = agg?.endpoint_filter?.request_name
      if (typeof reqName === 'string' && reqName.toLowerCase().endsWith('_export')) {
        fails.push({ id: `${srId} → ${aggName}` })
      }
    }
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.aggregates.*.endpoint_filter.request_name',
  ],
})

check('stock_requests', 's_endpoint_filter_use_requested_ids_true', "Requests must not have filtering enabled for endpoint request", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const ef = agg?.endpoint_filter
      if (!ef) continue
      if (ef.use_requested_ids === true) {
        fails.push({ id: `${srId} → ${aggName}` })
      }
    }
  }
  return fails
}, {
  fields: [
    'value.current.body.aggregates.*.endpoint_filter.use_requested_ids',
  ],
})

check('stock_requests', 's_item_query_no_filtering', "Requests must have filtering enabled for item request", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const itemFilter = agg?.item_filter
      if (!itemFilter) continue
      if (itemFilter.use_requested_ids !== true) {
        fails.push({ id: `${srId} → ${aggName}` })
      }
    }
  }
  return fails
}, {
  fields: [
    'value.current.body.aggregates.*.item_filter.use_requested_ids',
  ],
})

check('stock_requests', 's_full_param_missing', "Full export requests must have export parameter set to full", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isExportStockRequest(sr)) continue
    if (!(sr.name || '').toLowerCase().includes('full')) continue
    const diff = getStockRequestBody(sr).diff
    if (!diff) continue
    if (diff.only_change_stock !== false) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.diff.only_change_stock',
  ],
})

check('stock_requests', 's_diff_param_missing', "Diff export requests must have export parameter set to diff", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isExportStockRequest(sr)) continue
    if (!srId.toLowerCase().endsWith('_diff')) continue
    const diff = getStockRequestBody(sr).diff
    if (!diff) {
      fails.push({ id: srId })
      continue
    }
    if (diff.only_change_stock !== true) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.diff.only_change_stock',
  ],
})

check('stock_requests', 's_orchestration_detailed_unused', "Orchestration detailed requests must be used in a ruleset", (envData) => {
  const fails = []
  const allSr = envData.stock_requests?.stock_requests || {}
  const referenced = new Set()
  for (const ruleset of Object.values(envData.rulesets?.rulesets || {})) {
    for (const name of Object.values(getRulesetStockRequests(ruleset))) {
      if (typeof name !== 'string') continue
      let current = name
      while (current && !referenced.has(current)) {
        referenced.add(current)
        const sr = allSr[current]
        if (!sr) break
        current = getStockRequestBody(sr).inherit_from_request
      }
    }
  }
  for (const srId of Object.keys(allSr)) {
    if (isIgnoredStockRequest(srId)) continue
    if (!srId.toLowerCase().startsWith('orchestration_detailed_')) continue
    if (!referenced.has(srId)) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'rulesets.*.value.current_ruleset.stock_requests',
    'stock_requests.*.value.current.body.inherit_from_request',
  ],
})

check('stock_requests', 's_dp_detailed_unused', "DP detailed requests must be used in a delivery config", (envData) => {
  const fails = []
  const allSr = envData.stock_requests?.stock_requests || {}
  const referenced = new Set()
  for (const dc of Object.values(envData.delivery_configs?.delivery_configs || {})) {
    const sqName = dc?.value?.stock_request
    if (typeof sqName !== 'string') continue
    let current = sqName
    while (current && !referenced.has(current)) {
      referenced.add(current)
      const sr = allSr[current]
      if (!sr) break
      current = getStockRequestBody(sr).inherit_from_request
    }
  }
  for (const srId of Object.keys(allSr)) {
    if (isIgnoredStockRequest(srId)) continue
    if (!srId.toLowerCase().startsWith('dp_detailed_')) continue
    if (!referenced.has(srId)) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'delivery_configs.*.value.stock_request',
    'stock_requests.*.value.current.body.inherit_from_request',
  ],
})

check('stock_requests', 's_export_diff_key_mismatch', "Export requests diff key must match request name", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isExportStockRequest(sr)) continue
    const diff = getStockRequestBody(sr).diff
    if (!diff) continue
    const expected = srId.replace(/_(full|diff)$/, '')
    if (diff.key !== expected) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.diff.key',
  ],
})

check('stock_requests', 's_unified_aggregates_not_empty', "Unified requests aggregates must inherit from the detailed request", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isUnifiedStockRequest(sr)) continue
    const aggregates = getStockRequestAggregates(sr)
    if (Object.keys(aggregates).length > 0) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.aggregates',
  ],
})

check('stock_requests', 's_unified_no_unification', "Unified requests must have unification enabled", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isUnifiedStockRequest(sr)) continue
    const u = getStockRequestBody(sr).unification
    const enabled = u && (u.by_endpoint === true || u.by_stock_type === true)
    if (!enabled) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.unification.by_endpoint',
    'value.current.body.unification.by_stock_type',
  ],
})

check('stock_requests', 's_unified_no_inheritance', "Unified requests must inherit from the right detailed request", (envData) => {
  const fails = []
  const all = envData.stock_requests?.stock_requests || {}
  for (const [srId, sr] of Object.entries(all)) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isUnifiedStockRequest(sr)) continue
    const inherit = getStockRequestBody(sr).inherit_from_request
    const expectedDetailed = srId.replace('unified', 'detailed')
    if (inherit !== expectedDetailed) {
      fails.push({ id: srId })
    }
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.inherit_from_request',
  ],
})

check('stock_requests', 's_detailed_no_global_reservations', "Detailed requests must have global reservations enabled", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!isDetailedStockRequest(sr)) continue
    if (/^export_detailed_.*_diff$/.test(srId)) continue
    const deduction = getStockRequestBody(sr)?.deduction
    if (!deduction || !('global_reservation' in deduction)) fails.push({ id: srId })
  }
  return fails
}, {
  fields: [
    'name',
    'value.current.body.deduction.global_reservation',
  ],
})

// ---------------------------- DELIVERY CONFIGS ----------------------------

function eachDeliveryConfig(envData, fn) {
  for (const [dcId, dc] of Object.entries(envData.delivery_configs?.delivery_configs || {})) {
    const v = dc?.value || {}
    fn({ dcId, dc, v, name: dc?.name || v?.name || dcId })
  }
}

check('delivery_configs', 'd_method_not_in_name', "Delivery method must match delivery config", (envData) => {
  const fails = []
  eachDeliveryConfig(envData, ({ v, name }) => {
    const method = v.delivery_method
    if (typeof method !== 'string' || !method) return
    if (!name.toLowerCase().includes(method.toLowerCase())) {
      fails.push({ id: name })
    }
  })
  return fails
}, {
  fields: [
    'name',
    'value.delivery_method',
  ],
})

check('delivery_configs', 'd_module_method_mismatch', "CKC delivery configs must have CKC module enabled", (envData) => {
  const fails = []
  eachDeliveryConfig(envData, ({ v, name }) => {
    const method = v.delivery_method
    if (method !== 'click_collect' && method !== 'same_day_click_collect') return
    const modules = v.required_modules
    const ok = Array.isArray(modules) && modules.length === 1 && modules[0] === 'ckc'
    if (!ok) fails.push({ id: name })
  })
  return fails
}, {
  fields: [
    'value.delivery_method',
    'value.required_modules',
  ],
})

check('delivery_configs', 'd_name_country_vs_stock_request', "Country in delivery config name must match country in stock request", (envData) => {
  const fails = []
  eachDeliveryConfig(envData, ({ v, name }) => {
    const nameCountry = extractCountryFromName(name)
    if (!nameCountry) return
    const sqCountry = extractCountryFromName(v.stock_request)
    if (!sqCountry) return
    if (nameCountry !== sqCountry) fails.push({ id: name })
  })
  return fails
}, {
  fields: [
    'name',
    'value.stock_request',
  ],
})

check('delivery_configs', 'd_ckc_express_no_from_destination', "CKC express configs must have operation 'from_destination'", (envData) => {
  const fails = []
  eachDeliveryConfig(envData, ({ v, name }) => {
    if (v.delivery_method !== 'same_day_click_collect') return
    const fd = v.operations?.from_destination
    if (!Array.isArray(fd) || fd.length === 0) {
      fails.push({ id: name })
    }
  })
  return fails
}, {
  fields: [
    'value.delivery_method',
    'value.operations.from_destination',
  ],
})

check('delivery_configs', 'd_method_options_mismatch', "Carrier options must match delivery config name", (envData) => {
  const fails = []
  eachDeliveryConfig(envData, ({ v, name }) => {
    const carriers = v.carriers
    if (!Array.isArray(carriers) || carriers.length === 0) return
    const method = v.delivery_method
    if (method === 'click_collect' || method === 'same_day_click_collect') return
    const lowerName = (name || '').toLowerCase()
    if (typeof method === 'string' && method.toLowerCase().includes('international')) {
      if (!lowerName.includes('international')) {
        fails.push({ id: name })
      }
      return
    }
    for (const c of carriers) {
      const opt = c?.option
      if (typeof opt !== 'string' || !opt) continue
      if (!lowerName.includes(opt.toLowerCase())) {
        const carrierName = c?.name || '(unnamed carrier)'
        fails.push({ id: `${name} → ${carrierName} (option: ${opt})` })
      }
    }
  })
  return fails
}, {
  fields: [
    'name',
    'value.delivery_method',
    'value.carriers[].option',
  ],
})

check('delivery_configs', 'd_unified_detailed_mismatch', "Delivery configs unified stock request must match the detailed one", (envData) => {
  const fails = []
  const all = envData.stock_requests?.stock_requests || {}
  eachDeliveryConfig(envData, ({ v, name }) => {
    const sqName = v.stock_request
    if (!sqName) return
    const sr = all[sqName]
    if (!sr) return
    if (!isUnifiedStockRequest(sr)) return
    const inherit = getStockRequestBody(sr).inherit_from_request
    if (!inherit) {
      fails.push({ id: name })
      return
    }
    const detailedExists = !!all[inherit]
    if (!detailedExists) fails.push({ id: name })
  })
  return fails
}, {
  fields: [
    'value.stock_request',
    'stock_requests.*.value.current.body.inherit_from_request',
  ],
})

export default CHECKS
