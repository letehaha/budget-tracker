import { DataType } from 'sequelize-typescript';

import { Money } from './money';

/**
 * Returns Sequelize column configuration with getter/setter that automatically
 * converts between raw DB values and Money instances.
 *
 * Usage with sequelize-typescript @Column decorator:
 *
 * @example
 * // For INTEGER columns storing cents:
 * @Column(MoneyColumn({ storage: 'cents', fieldName: 'amount' }))
 * amount!: Money;
 *
 * // For DECIMAL columns (investments):
 * @Column(MoneyColumn({ storage: 'decimal', fieldName: 'quantity', precision: 20, scale: 10 }))
 * quantity!: Money;
 */
export function MoneyColumn(opts: MoneyColumnCentsOptions): MoneyColumnConfig;
export function MoneyColumn(opts: MoneyColumnDecimalOptions): MoneyColumnConfig;
export function MoneyColumn(opts: MoneyColumnOptions): MoneyColumnConfig {
  const { fieldName } = opts;

  if (opts.storage === 'cents') {
    return {
      type: DataType.INTEGER,
      allowNull: opts.allowNull ?? false,
      defaultValue: opts.defaultValue ?? 0,
      get(this: MoneyColumnContext) {
        const raw = this.getDataValue(fieldName) as number | null | undefined;
        if (raw === null || raw === undefined) return null;
        return Money.fromCents(raw);
      },
      set(this: MoneyColumnContext, val: Money | number | null) {
        if (val === null) {
          this.setDataValue(fieldName, null);
        } else if (val instanceof Money) {
          this.setDataValue(fieldName, val.toCents());
        } else {
          // Backward compatibility: accept raw numbers during migration
          this.setDataValue(fieldName, val);
        }
      },
    };
  }

  // storage === 'decimal'
  const { precision = 20, scale = 10 } = opts;
  return {
    type: DataType.DECIMAL(precision, scale),
    allowNull: opts.allowNull ?? false,
    defaultValue: opts.defaultValue ?? '0',
    get(this: MoneyColumnContext) {
      const raw = this.getDataValue(fieldName) as string | number | null | undefined;
      if (raw === null || raw === undefined) return null;
      return Money.fromDecimal(raw);
    },
    set(this: MoneyColumnContext, val: Money | string | number | null) {
      if (val === null) {
        this.setDataValue(fieldName, null);
      } else if (val instanceof Money) {
        this.setDataValue(fieldName, val.toDecimalString(scale));
      } else {
        // Backward compatibility: accept raw values during migration
        this.setDataValue(fieldName, val);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MoneyColumnBaseOptions {
  allowNull?: boolean;
  defaultValue?: number | string;
  /** Must match the property name on the model class. */
  fieldName: string;
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

interface MoneyColumnContext {
  getDataValue(key: string): unknown;
  setDataValue(key: string, value: unknown): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MoneyColumnConfig = Record<string, any>;
