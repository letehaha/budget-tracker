import type { TransactionLocation } from '@bt/shared/types';

export const buildMapUrl = ({ latitude, longitude }: TransactionLocation) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
