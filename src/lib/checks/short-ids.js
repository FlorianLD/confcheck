// Stable short IDs for every check, for easy reference in chat / tickets.
// NEVER reuse a number that has been retired — add new entries at the end of
// each section instead, even if there are gaps.

export const SHORT_IDS = {
  // --- Rulesets (R) ---
  r_store_empty_calendars: 'R01',
  r_warehouse_no_auto_claim: 'R02',
  r_warehouse_rules_no_warehouse_query: 'R03',
  r_store_rules_no_store_query: 'R04',
  r_country_mismatch_query: 'R05',
  r_store_no_timeout: 'R06',
  r_collection_store_no_ckc: 'R07',
  r_country_name_mismatch: 'R08',
  c1180_store_rule_triplet_pattern: 'R09',
  c1180_timetable_country_mismatch: 'R10',
  c1180_p1_store_rule_config: 'R11',
  c1180_p2_store_rule_config: 'R12',
  c1180_general_store_rule_config: 'R13',
  c1180_store_before_warehouse_per_split: 'R14',

  // --- Stock requests (S) ---
  s_export_no_export_endpoint: 'S01',
  s_non_export_uses_export_endpoint: 'S02',
  s_endpoint_filter_use_requested_ids_true: 'S03',
  s_item_query_no_filtering: 'S04',
  s_full_param_missing: 'S05',
  s_diff_param_missing: 'S06',
  s_orchestration_detailed_unused: 'S07',
  s_dp_detailed_unused: 'S08',
  s_export_diff_key_mismatch: 'S09',
  s_unified_aggregates_not_empty: 'S10',
  s_unified_no_unification: 'S11',
  s_unified_no_inheritance: 'S12',
  s_detailed_no_global_reservations: 'S13',
  c1180_orchestration_missing_orchestration_buffer: 'S14',
  c1180_attributes_not_wildcard: 'S15',
  c1180_endpoint_reservation_not_empty: 'S16',
  c1180_global_buffer_not_empty: 'S17',
  c1180_export_diff_unreferenced_stock: 'S18',
  c1180_orchestration_has_global_buffer: 'S19',

  // --- Delivery configs (D) ---
  d_method_not_in_name: 'D01',
  d_module_method_mismatch: 'D02',
  d_name_country_vs_stock_request: 'D03',
  d_ckc_express_no_from_destination: 'D04',
  d_method_options_mismatch: 'D05',
  d_unified_detailed_mismatch: 'D06',
  c1180_method_ops_standard_home_delivery: 'D07',
  c1180_method_ops_express_home_delivery: 'D08',
  c1180_method_ops_next_day_home_delivery: 'D09',
  c1180_method_ops_click_collect: 'D10',
  c1180_method_ops_same_day_click_collect: 'D11',
}
