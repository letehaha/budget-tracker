import { Op, WhereOptions } from 'sequelize';

/**
 * Builds a Sequelize where clause for filtering by date range.
 * Returns a filter object with `time` property if dates are provided.
 */
export const buildDateFilter = ({
  startDate,
  endDate,
}: {
  startDate: Date | null | undefined;
  endDate: Date | null | undefined;
}): WhereOptions => {
  if (startDate && endDate) {
    return { time: { [Op.between]: [startDate, endDate] } };
  }
  if (startDate) {
    return { time: { [Op.gte]: startDate } };
  }
  if (endDate) {
    return { time: { [Op.lte]: endDate } };
  }
  return {};
};
