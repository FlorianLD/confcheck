import {
  getRulesetRules,
  isStoreRule,
  isWarehouseRule,
  getRuleEfficiencyValue,
  makeRuleFailure,
  isIgnoredStockRequest,
  getStockRequestAggregates,
  getStockRequestBody,
  extractCountryFromName,
} from '../../utils.js'

const CHECKS = []

function check(category, id, label, run) {
  CHECKS.push({ category, id, label, run })
}

function indexedStoreRules(ruleset) {
  const out = []
  getRulesetRules(ruleset).forEach((rule, i) => {
    if (isStoreRule(rule)) out.push({ rule, index: i })
  })
  return out
}

const EXPECTED_SORT_CRITERIA = [{ sort_by: 'stock_coverage', desc: true, interval: 1 }]

function sortCriteriaMatches(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i] || {}
    const e = expected[i]
    if (a.sort_by !== e.sort_by || a.desc !== e.desc || a.interval !== e.interval) return false
  }
  return true
}

function hasEmptyStockConstraints(rule) {
  return Array.isArray(rule?.stock_constraints) && rule.stock_constraints.length === 0
}

const METHOD_OPERATIONS = {
  standard_home_delivery: { before_shipping: ['standard_prep_time'] },
  express_home_delivery: { before_shipping: ['express_prep_time'] },
  next_day_home_delivery: { before_shipping: ['next_day_prep_time'] },
  click_collect: {
    after_shipping: ['ckc_recep_time'],
    before_shipping: ['standard_prep_time'],
  },
  same_day_click_collect: {
    from_destination: ['ckc_express_prep_time', 'prep_milestone'],
  },
}

function eachDeliveryConfig(envData, fn) {
  for (const [dcId, dc] of Object.entries(envData.delivery_configs?.delivery_configs || {})) {
    const v = dc?.value || {}
    fn({ dcId, dc, v, name: dc?.name || v?.name || dcId })
  }
}

check('rulesets', 'c1180_store_rule_triplet_pattern', "Store rules must be used in priority sequence 0.95, 0.85, no priority", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const stores = indexedStoreRules(ruleset)
    if (stores.length === 0 || stores.length % 3 !== 0) continue
    for (let g = 0; g < stores.length; g += 3) {
      const p1 = stores[g]
      const p2 = stores[g + 1]
      const general = stores[g + 2]
      if (getRuleEfficiencyValue(p1.rule) !== 0.95) {
        fails.push(makeRuleFailure(rsId, p1.rule, p1.index))
      }
      if (getRuleEfficiencyValue(p2.rule) !== 0.85) {
        fails.push(makeRuleFailure(rsId, p2.rule, p2.index))
      }
      if (getRuleEfficiencyValue(general.rule) != null) {
        fails.push(makeRuleFailure(rsId, general.rule, general.index))
      }
    }
  }
  return fails
})

check('stock_requests', 'c1180_orchestration_missing_orchestration_buffer', "Orchestration requests must use 'orchestration_buffer' in endpoint buffer", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!srId.toLowerCase().startsWith('orchestration_detailed_')) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const buf = agg?.deduction?.endpoint_buffer
      if (!Array.isArray(buf) || !buf.includes('orchestration_buffer')) {
        fails.push({
          id: `${srId} → ${aggName}`,
          linkPath: `/config/request/stock/${srId}`,
        })
      }
    }
  }
  return fails
})

check('stock_requests', 'c1180_attributes_not_wildcard', "Export, orchestration and DP requests must take all UATFs into account", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const lower = srId.toLowerCase()
    if (!lower.startsWith('orchestration_') && !lower.startsWith('export_') && !lower.startsWith('dp_')) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const attrs = agg?.deduction?.attributes
      const ok = Array.isArray(attrs) && attrs.length === 1 && attrs[0] === '*'
      if (!ok) {
        fails.push({
          id: `${srId} → ${aggName}`,
          linkPath: `/config/request/stock/${srId}`,
        })
      }
    }
  }
  return fails
})

check('stock_requests', 'c1180_endpoint_reservation_not_empty', "Export, orchestration and DP requests must take all stock location reservations into account", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const lower = srId.toLowerCase()
    if (!lower.startsWith('orchestration_') && !lower.startsWith('export_') && !lower.startsWith('dp_')) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const er = agg?.deduction?.endpoint_reservation
      const ok = Array.isArray(er) && er.length === 0
      if (!ok) {
        fails.push({
          id: `${srId} → ${aggName}`,
          linkPath: `/config/request/stock/${srId}`,
        })
      }
    }
  }
  return fails
})

check('stock_requests', 'c1180_global_buffer_not_empty', "Export and DP requests must take all global buffers into account", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const lower = srId.toLowerCase()
    if (!lower.startsWith('export_') && !lower.startsWith('dp_')) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const gb = agg?.deduction?.global_buffer
      const ok = Array.isArray(gb) && gb.length === 0
      if (!ok) {
        fails.push({
          id: `${srId} → ${aggName}`,
          linkPath: `/config/request/stock/${srId}`,
        })
      }
    }
  }
  return fails
})

check('stock_requests', 'c1180_export_diff_unreferenced_stock', "Export diff requests must export unreferenced items", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    const lower = srId.toLowerCase()
    if (!lower.startsWith('export_') || !lower.endsWith('_diff')) continue
    const diff = getStockRequestBody(sr).diff
    if (!diff || diff.unreferenced_stock !== true) {
      fails.push({
        id: srId,
        linkPath: `/config/request/stock/${srId}`,
      })
    }
  }
  return fails
})

check('stock_requests', 'c1180_orchestration_has_global_buffer', "Orchestration requests must not take global buffers into account", (envData) => {
  const fails = []
  for (const [srId, sr] of Object.entries(envData.stock_requests?.stock_requests || {})) {
    if (isIgnoredStockRequest(srId)) continue
    if (!srId.toLowerCase().startsWith('orchestration_')) continue
    const aggregates = getStockRequestAggregates(sr)
    for (const [aggName, agg] of Object.entries(aggregates)) {
      const deduction = agg?.deduction
      if (deduction && Object.prototype.hasOwnProperty.call(deduction, 'global_buffer')) {
        fails.push({
          id: `${srId} → ${aggName}`,
          linkPath: `/config/request/stock/${srId}`,
        })
      }
    }
  }
  return fails
})

check('rulesets', 'c1180_timetable_country_mismatch', "Store rule timetable must match country in rule name", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const rules = getRulesetRules(ruleset)
    rules.forEach((rule, i) => {
      const ruleCountry = extractCountryFromName(rule?.name)
      if (!ruleCountry) return
      const tableCountry = extractCountryFromName(rule?.countdown_timetable?.name)
      if (tableCountry !== ruleCountry) {
        fails.push(makeRuleFailure(rsId, rule, i))
      }
    })
  }
  return fails
})

check('rulesets', 'c1180_p1_store_rule_config', "P1 store rule must have max 10 candidates, rule_timeout 3600, and sorting by stock coverage (desc)", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const stores = indexedStoreRules(ruleset)
    if (stores.length === 0 || stores.length % 3 !== 0) continue
    for (let g = 0; g < stores.length; g += 3) {
      const { rule, index } = stores[g]
      const ok = rule?.max === 10
        && rule?.rule_timeout === 3600
        && sortCriteriaMatches(rule?.sort_criteria, EXPECTED_SORT_CRITERIA)
        && hasEmptyStockConstraints(rule)
      if (!ok) fails.push(makeRuleFailure(rsId, rule, index))
    }
  }
  return fails
})

check('rulesets', 'c1180_p2_store_rule_config', "P2 store rule must have max 20 candidates, rule_timeout 3600, and sorting by stock coverage (desc)", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const stores = indexedStoreRules(ruleset)
    if (stores.length === 0 || stores.length % 3 !== 0) continue
    for (let g = 0; g < stores.length; g += 3) {
      const { rule, index } = stores[g + 1]
      const ok = rule?.max === 20
        && rule?.rule_timeout === 3600
        && sortCriteriaMatches(rule?.sort_criteria, EXPECTED_SORT_CRITERIA)
        && hasEmptyStockConstraints(rule)
      if (!ok) fails.push(makeRuleFailure(rsId, rule, index))
    }
  }
  return fails
})

check('rulesets', 'c1180_general_store_rule_config', "General store rule must have rule_timeout=7200 and stock_constraints=[]", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const stores = indexedStoreRules(ruleset)
    if (stores.length === 0 || stores.length % 3 !== 0) continue
    for (let g = 0; g < stores.length; g += 3) {
      const { rule, index } = stores[g + 2]
      const ok = rule?.rule_timeout === 7200 && hasEmptyStockConstraints(rule)
      if (!ok) fails.push(makeRuleFailure(rsId, rule, index))
    }
  }
  return fails
})

for (const [method, phases] of Object.entries(METHOD_OPERATIONS)) {
  const allOps = Object.values(phases).flat()
  const opWord = allOps.length > 1 ? 'operations' : 'operation'
  check(
    'delivery_configs',
    `c1180_method_ops_${method}`,
    `Delivery method '${method}' must use ${opWord} ${allOps.join(', ')}`,
    (envData) => {
      const fails = []
      eachDeliveryConfig(envData, ({ v, name }) => {
        if (v.delivery_method !== method) return
        const allOk = Object.entries(phases).every(([phase, required]) => {
          const ops = v.operations?.[phase]
          return Array.isArray(ops) && required.every(req => ops.includes(req))
        })
        if (!allOk) {
          fails.push({ id: name, linkPath: '/delivery/current/configs' })
        }
      })
      return fails
    }
  )
}

check('rulesets', 'c1180_store_before_warehouse_per_split', "Warehouse rules must always come after the store rules at each split level", (envData) => {
  const fails = []
  for (const [rsId, ruleset] of Object.entries(envData.rulesets?.rulesets || {})) {
    const rules = getRulesetRules(ruleset)
    const ranked = []
    rules.forEach((rule, i) => {
      const m = /\((\d+)\s*splits?\)/i.exec(rule?.name || '')
      if (!m) return
      const level = parseInt(m[1], 10)
      let type
      if (isStoreRule(rule)) type = 0
      else if (isWarehouseRule(rule)) type = 1
      else return
      ranked.push({ rank: level * 10 + type, i, rule })
    })

    let maxRank = -Infinity
    for (const { rank, i, rule } of ranked) {
      if (rank < maxRank) {
        fails.push(makeRuleFailure(rsId, rule, i))
      } else {
        maxRank = rank
      }
    }
  }
  return fails
})

export default CHECKS
