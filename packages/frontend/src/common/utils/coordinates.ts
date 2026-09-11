export const COORDINATE_PRECISION = 6;

export const roundCoordinate = ({ value }: { value: number }) => Number(value.toFixed(COORDINATE_PRECISION));
