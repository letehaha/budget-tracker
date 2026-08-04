import { LogoResolutionState } from '@bt/shared/types';

/** The logo columns every logo-carrying entity row declares. */
interface LogoColumns {
  logoDomain: string | null;
  logoSource: LogoResolutionState;
  logoInitials: string | null;
  logoColor: string | null;
}

/**
 * Wipes the logo columns on the instance in memory – the caller persists it.
 * `logoSource: null` is what marks the row as needing a resolution pass again,
 * so entities with auto-resolution must also enqueue one after the commit.
 */
export const clearManualLogoFields = ({ instance }: { instance: LogoColumns }): void => {
  instance.logoDomain = null;
  instance.logoSource = null;
  instance.logoInitials = null;
  instance.logoColor = null;
};
