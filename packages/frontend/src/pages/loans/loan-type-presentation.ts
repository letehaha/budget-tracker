import { LOAN_TYPE } from '@bt/shared/types';
import {
  BriefcaseIcon,
  CarIcon,
  CoinsIcon,
  GraduationCapIcon,
  HouseIcon,
  KeyRoundIcon,
  StethoscopeIcon,
  WalletIcon,
} from '@lucide/vue';
import type { Component } from 'vue';

/**
 * Single source for the per-loan-type hue and icon, so list cards and the
 * detail summary can't drift apart. The hue is intentionally split into two
 * class maps (gradient stripe vs. badge) because Tailwind can't compose
 * `from-*`/`bg-*` utilities from one token at runtime.
 */

const LOAN_TYPE_SOLID_BADGE_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'bg-blue-500 text-white',
  [LOAN_TYPE.auto]: 'bg-amber-500 text-white',
  [LOAN_TYPE.student]: 'bg-violet-500 text-white',
  [LOAN_TYPE.personal]: 'bg-emerald-500 text-white',
  [LOAN_TYPE.heloc]: 'bg-cyan-500 text-white',
  [LOAN_TYPE.business]: 'bg-rose-500 text-white',
  [LOAN_TYPE.medical]: 'bg-pink-500 text-white',
  [LOAN_TYPE.other]: 'bg-slate-500 text-white',
};

const LOAN_TYPE_BADGE_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  [LOAN_TYPE.auto]: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  [LOAN_TYPE.student]: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  [LOAN_TYPE.personal]: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  [LOAN_TYPE.heloc]: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  [LOAN_TYPE.business]: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  [LOAN_TYPE.medical]: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  [LOAN_TYPE.other]: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

const LOAN_TYPE_ICONS: Record<LOAN_TYPE, Component> = {
  [LOAN_TYPE.mortgage]: HouseIcon,
  [LOAN_TYPE.auto]: CarIcon,
  [LOAN_TYPE.student]: GraduationCapIcon,
  [LOAN_TYPE.personal]: WalletIcon,
  [LOAN_TYPE.heloc]: KeyRoundIcon,
  [LOAN_TYPE.business]: BriefcaseIcon,
  [LOAN_TYPE.medical]: StethoscopeIcon,
  [LOAN_TYPE.other]: CoinsIcon,
};

// Fall back to `other` so an unrecognized loanType (e.g. a value added
// server-side before the frontend ships its mapping) still renders.
export const getLoanTypeSolidBadgeClass = ({ loanType }: { loanType: LOAN_TYPE }): string =>
  LOAN_TYPE_SOLID_BADGE_CLASSES[loanType] ?? LOAN_TYPE_SOLID_BADGE_CLASSES[LOAN_TYPE.other];

export const getLoanTypeBadgeClass = ({ loanType }: { loanType: LOAN_TYPE }): string =>
  LOAN_TYPE_BADGE_CLASSES[loanType] ?? LOAN_TYPE_BADGE_CLASSES[LOAN_TYPE.other];

export const getLoanTypeIcon = ({ loanType }: { loanType: LOAN_TYPE }): Component =>
  LOAN_TYPE_ICONS[loanType] ?? LOAN_TYPE_ICONS[LOAN_TYPE.other];
