import type { TransactionLocation } from '@bt/shared/types';

const MAP_ZOOM = 16;

export const buildMapUrl = ({ latitude, longitude }: TransactionLocation) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${MAP_ZOOM}/${latitude}/${longitude}`;
