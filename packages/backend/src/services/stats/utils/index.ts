import { endOfDay } from 'date-fns';
import { Op } from 'sequelize';

type ColumnName = 'time' | 'date';
interface DateQuery {
  // yyyy-mm-dd
  from?: string;
  // yyyy-mm-dd
  to?: string;
  columnName: ColumnName;
}

export const getWhereConditionForTime = ({ from, to, columnName }: DateQuery) => {
  const where: Partial<Record<ColumnName, Record<symbol, Date[] | Date>>> = {};

  if (from && to) {
    where[columnName] = {
      [Op.between]: [new Date(from), endOfDay(new Date(to))],
    };
  } else if (from) {
    where[columnName] = {
      [Op.gte]: new Date(from),
    };
  } else if (to) {
    where[columnName] = {
      [Op.lte]: new Date(to),
    };
  }

  return where;
};
