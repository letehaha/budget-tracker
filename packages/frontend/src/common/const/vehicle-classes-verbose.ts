import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';

/**
 * Maps vehicle-class enum values to their translation keys. Same shape as
 * ACCOUNT_CATEGORIES_TRANSLATION_KEYS — use with i18n t().
 */
export const VEHICLE_CLASS_TRANSLATION_KEYS = Object.freeze({
  [VEHICLE_CLASS.sedan]: 'common.vehicleClasses.sedan',
  [VEHICLE_CLASS.suv]: 'common.vehicleClasses.suv',
  [VEHICLE_CLASS.truck]: 'common.vehicleClasses.truck',
  [VEHICLE_CLASS.luxury]: 'common.vehicleClasses.luxury',
  [VEHICLE_CLASS.ev]: 'common.vehicleClasses.ev',
  [VEHICLE_CLASS.motorcycle]: 'common.vehicleClasses.motorcycle',
  [VEHICLE_CLASS.other]: 'common.vehicleClasses.other',
});

export const DEPRECIATION_PRESET_TRANSLATION_KEYS = Object.freeze({
  [DEPRECIATION_PRESET.classDefault]: 'common.depreciationPresets.classDefault',
  [DEPRECIATION_PRESET.slow]: 'common.depreciationPresets.slow',
  [DEPRECIATION_PRESET.average]: 'common.depreciationPresets.average',
  [DEPRECIATION_PRESET.fast]: 'common.depreciationPresets.fast',
  [DEPRECIATION_PRESET.custom]: 'common.depreciationPresets.custom',
});
