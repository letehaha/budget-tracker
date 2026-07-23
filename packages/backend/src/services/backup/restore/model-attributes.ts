import { Model, type ModelAttributeColumnOptions, type ModelStatic } from 'sequelize';

type AnyModel = ModelStatic<Model>;

/** Minimal view of a Sequelize attribute definition the restore path reads. */
export interface AttributeInfo {
  /** Model-side name — the key a `raw: true` dump uses. */
  attrName: string;
  /** DB column name — the key `queryInterface.bulkInsert` writes. */
  field: string;
  allowNull: boolean;
  hasDefault: boolean;
  autoIncrement: boolean;
}

/**
 * The insertable attributes of a model, keyed by model-side name. `hasDefault`
 * folds together an explicit model default, an auto-increment serial, and a
 * generated primary key (all of which let the DB fill the column when a row
 * omits it), so the column tolerance check only hard-fails on a genuinely-required
 * column with no way to supply a value.
 */
export function getModelAttributeInfos({ model }: { model: AnyModel }): AttributeInfo[] {
  const attrs = model.getAttributes();
  return Object.entries(attrs).map(([attrName, def]) => {
    const d = def as {
      field?: string;
      allowNull?: boolean;
      defaultValue?: unknown;
      autoIncrement?: boolean;
    };
    return {
      attrName,
      field: d.field ?? attrName,
      allowNull: d.allowNull !== false,
      hasDefault: d.defaultValue !== undefined,
      autoIncrement: d.autoIncrement === true,
    };
  });
}

/**
 * Column-type map keyed by DB column name, as `queryInterface.bulkInsert`'s
 * fourth argument expects it. Passing it makes the query generator serialize
 * each value by its real column type — JSONB objects, UUID/text arrays, and
 * decimals all round-trip correctly instead of being coerced to `[object Object]`.
 */
export function getFieldMappedAttributes({ model }: { model: AnyModel }): Record<string, ModelAttributeColumnOptions> {
  return (model as unknown as { fieldRawAttributesMap: Record<string, ModelAttributeColumnOptions> })
    .fieldRawAttributesMap;
}
