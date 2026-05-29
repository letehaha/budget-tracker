import { Money } from './money';

// ---------------------------------------------------------------------------
// Getter/setter helpers for use inside class getter/setter pairs
// ---------------------------------------------------------------------------

interface ModelDataAccess {
  getDataValue(key: string): unknown;
  setDataValue(key: string, value: unknown): void;
}

/** Getter helper for INTEGER (cents) columns → returns Money */
export function moneyGetCents(model: ModelDataAccess, field: string): Money {
  const raw = model.getDataValue(field);
  if (raw === null || raw === undefined) return null as unknown as Money;
  // Pass through non-numbers (e.g. Sequelize Literals from Model.update())
  if (typeof raw !== 'number') return raw as unknown as Money;
  return Money.fromCents(raw as number);
}

/** Setter helper for INTEGER (cents) columns ← accepts Money or raw number */
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
