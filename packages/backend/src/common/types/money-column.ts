import { DataType } from 'sequelize-typescript';

import { Money } from './money';

// ---------------------------------------------------------------------------
// Column config helper (type + allowNull + defaultValue only, NO get/set)
// ---------------------------------------------------------------------------

/**
 * Returns Sequelize column type configuration for money fields.
 * Use with class getter/setter pairs and the moneyGet / moneySet helpers.
 *
 * @example
 * // BIGINT column storing cents:
 * @Column(MoneyColumn({ storage: 'cents' }))
 * get amount(): Money { return moneyGetCents(this, 'amount'); }
 * set amount(val: Money | number) { moneySetCents(this, 'amount', val); }
 *
 * // DECIMAL column (investments):
 * @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
 * get quantity(): Money { return moneyGetDecimal(this, 'quantity'); }
 * set quantity(val: Money | string | number) { moneySetDecimal(this, 'quantity', val, 10); }
 */
export function MoneyColumn(opts: MoneyColumnCentsOptions): MoneyColumnConfig;
export function MoneyColumn(opts: MoneyColumnDecimalOptions): MoneyColumnConfig;
export function MoneyColumn(opts: MoneyColumnOptions): MoneyColumnConfig {
  // When the column is nullable AND the caller did not explicitly supply a
  // defaultValue, default to `null` instead of `0`/`'0'`. Storing 0 for a
  // semantically-absent value loses the distinction between "no value set" and
  // "value is zero" and breaks `valueAnchor ?? fallback` patterns downstream.
  const nullableNoDefault = opts.allowNull === true && opts.defaultValue === undefined;

  if (opts.storage === 'cents') {
    // BIGINT (not INTEGER) so that low-denomination currencies (IDR, VND, etc.)
    // or any large balance can exceed the 32-bit INTEGER ceiling without overflow.
    return {
      type: DataType.BIGINT,
      allowNull: opts.allowNull ?? false,
      defaultValue: nullableNoDefault ? null : (opts.defaultValue ?? 0),
    };
  }

  // storage === 'decimal'
  const { precision = 20, scale = 10 } = opts;
  return {
    type: DataType.DECIMAL(precision, scale),
    allowNull: opts.allowNull ?? false,
    defaultValue: nullableNoDefault ? null : (opts.defaultValue ?? '0'),
  };
}

// ---------------------------------------------------------------------------
// Getter/setter helpers for use inside class getter/setter pairs
// ---------------------------------------------------------------------------

interface ModelDataAccess {
  getDataValue(key: string): unknown;
  setDataValue(key: string, value: unknown): void;
}

/** Getter helper for BIGINT (cents) columns → returns Money */
export function moneyGetCents(model: ModelDataAccess, field: string): Money {
  const raw = model.getDataValue(field);
  if (raw === null || raw === undefined) return null as unknown as Money;
  // Pass through non-numbers (e.g. Sequelize Literals from Model.update())
  if (typeof raw !== 'number') return raw as unknown as Money;
  return Money.fromCents(raw as number);
}

/** Setter helper for BIGINT (cents) columns ← accepts Money or raw number */
export function moneySetCents(model: ModelDataAccess, field: string, val: Money | number | null): void {
  if (val === null) {
    model.setDataValue(field, null);
  } else if (Money.isMoney(val)) {
    model.setDataValue(field, val.toCents());
  } else {
    // Backward compatibility: accept raw numbers
    model.setDataValue(field, val);
  }
}

/** Getter helper for DECIMAL columns → returns Money */
export function moneyGetDecimal(model: ModelDataAccess, field: string): Money {
  const raw = model.getDataValue(field);
  if (raw === null || raw === undefined) return null as unknown as Money;
  // Pass through non-primitive values (e.g. Sequelize Literals from Model.update())
  if (typeof raw !== 'number' && typeof raw !== 'string') return raw as unknown as Money;
  return Money.fromDecimal(raw as string | number);
}

/** Setter helper for DECIMAL columns ← accepts Money or raw value */
export function moneySetDecimal(
  model: ModelDataAccess,
  field: string,
  val: Money | string | number | null,
  scale: number,
): void {
  if (val === null) {
    model.setDataValue(field, null);
  } else if (Money.isMoney(val)) {
    model.setDataValue(field, val.toDecimalString(scale));
  } else {
    // Backward compatibility: accept raw values
    model.setDataValue(field, val);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MoneyColumnBaseOptions {
  allowNull?: boolean;
  defaultValue?: number | string;
}

interface MoneyColumnCentsOptions extends MoneyColumnBaseOptions {
  storage: 'cents';
}

interface MoneyColumnDecimalOptions extends MoneyColumnBaseOptions {
  storage: 'decimal';
  precision?: number;
  scale?: number;
}

type MoneyColumnOptions = MoneyColumnCentsOptions | MoneyColumnDecimalOptions;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MoneyColumnConfig = Record<string, any>;
