// Re-export shared depreciation curve constants so the backend service path
// keeps its existing import surface. The single source of truth lives in
// `@bt/shared/types/vehicles` and is consumed by both backend math and the
// frontend chart.
export { CLASS_DEFAULT_CURVES, TAIL_RATE_PCT, PRESET_MULTIPLIERS } from '@bt/shared/types';
