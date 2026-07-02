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
 * Single source for per-loan-type hue and icon so cards don't drift apart. Hue is split into two class maps
 * (gradient stripe vs. badge) because Tailwind can't compose `from-*`/`bg-*` utilities from one token at runtime.
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

// Fall back to `other` so an unrecognized loanType (e.g. new server-side value) still renders.
export const getLoanTypeSolidBadgeClass = ({ loanType }: { loanType: LOAN_TYPE }): string =>
  LOAN_TYPE_SOLID_BADGE_CLASSES[loanType] ?? LOAN_TYPE_SOLID_BADGE_CLASSES[LOAN_TYPE.other];

export const getLoanTypeIcon = ({ loanType }: { loanType: LOAN_TYPE }): Component =>
  LOAN_TYPE_ICONS[loanType] ?? LOAN_TYPE_ICONS[LOAN_TYPE.other];
