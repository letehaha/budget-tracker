import { UserModel } from '../db-models';

export interface VenturePlatformModel {
  id: string;
  userId: number;
  name: string;
  website: string | null;
  description: string | null;
  defaultEntryFeePct: string;
  defaultMgmtFeePct: string;
  defaultCarryPct: string;
  defaultHurdlePct: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  user?: UserModel;
}
