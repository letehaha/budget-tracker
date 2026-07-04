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
 * Single source for per-loan-type color and icon so cards don't drift apart. Color comes from the
 * `--loan-<type>` design tokens (see `global.css`) bridged to Tailwind as `bg-loan-<type>` /
 * `text-loan-<type>`; it's split into three class maps because badge, bar, and chip apply the same
 * hue at different fill strengths.
 */

const LOAN_TYPE_SOLID_BADGE_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'bg-loan-mortgage text-white',
  [LOAN_TYPE.auto]: 'bg-loan-auto text-white',
  [LOAN_TYPE.student]: 'bg-loan-student text-white',
  [LOAN_TYPE.personal]: 'bg-loan-personal text-white',
  [LOAN_TYPE.heloc]: 'bg-loan-heloc text-white',
  [LOAN_TYPE.business]: 'bg-loan-business text-white',
  [LOAN_TYPE.medical]: 'bg-loan-medical text-white',
  [LOAN_TYPE.other]: 'bg-loan-other text-white',
};

/** Solid fill for composition-bar segments and legend dots — same hue family as the badges. */
const LOAN_TYPE_BAR_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'bg-loan-mortgage',
  [LOAN_TYPE.auto]: 'bg-loan-auto',
  [LOAN_TYPE.student]: 'bg-loan-student',
  [LOAN_TYPE.personal]: 'bg-loan-personal',
  [LOAN_TYPE.heloc]: 'bg-loan-heloc',
  [LOAN_TYPE.business]: 'bg-loan-business',
  [LOAN_TYPE.medical]: 'bg-loan-medical',
  [LOAN_TYPE.other]: 'bg-loan-other',
};

/** Soft tinted square behind the loan-type icon in list rows — same hue as tint fill and text. */
const LOAN_TYPE_TINTED_CHIP_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'bg-loan-mortgage/15 text-loan-mortgage',
  [LOAN_TYPE.auto]: 'bg-loan-auto/15 text-loan-auto',
  [LOAN_TYPE.student]: 'bg-loan-student/15 text-loan-student',
  [LOAN_TYPE.personal]: 'bg-loan-personal/15 text-loan-personal',
  [LOAN_TYPE.heloc]: 'bg-loan-heloc/15 text-loan-heloc',
  [LOAN_TYPE.business]: 'bg-loan-business/15 text-loan-business',
  [LOAN_TYPE.medical]: 'bg-loan-medical/15 text-loan-medical',
  [LOAN_TYPE.other]: 'bg-loan-other/15 text-loan-other',
};

/** Emoji shown in the loan-type badge pill (a warmer companion to the lucide icon kept in list chips). */
const LOAN_TYPE_EMOJI: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: '🏠',
  [LOAN_TYPE.auto]: '🚗',
  [LOAN_TYPE.student]: '🎓',
  [LOAN_TYPE.personal]: '👛',
  [LOAN_TYPE.heloc]: '🔑',
  [LOAN_TYPE.business]: '💼',
  [LOAN_TYPE.medical]: '🩺',
  [LOAN_TYPE.other]: '🪙',
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

export const getLoanTypeBarClass = ({ loanType }: { loanType: LOAN_TYPE }): string =>
  LOAN_TYPE_BAR_CLASSES[loanType] ?? LOAN_TYPE_BAR_CLASSES[LOAN_TYPE.other];

export const getLoanTypeTintedChipClass = ({ loanType }: { loanType: LOAN_TYPE }): string =>
  LOAN_TYPE_TINTED_CHIP_CLASSES[loanType] ?? LOAN_TYPE_TINTED_CHIP_CLASSES[LOAN_TYPE.other];

export const getLoanTypeIcon = ({ loanType }: { loanType: LOAN_TYPE }): Component =>
  LOAN_TYPE_ICONS[loanType] ?? LOAN_TYPE_ICONS[LOAN_TYPE.other];

export const getLoanTypeEmoji = ({ loanType }: { loanType: LOAN_TYPE }): string =>
  LOAN_TYPE_EMOJI[loanType] ?? LOAN_TYPE_EMOJI[LOAN_TYPE.other];
