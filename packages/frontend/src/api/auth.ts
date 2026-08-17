import { api } from '@/api/_api';

export const getSignupsOpen = async (): Promise<{ signupsOpen: boolean }> => api.get('/auth/signups-open');
