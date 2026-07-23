/**
 * Consent validity for a bank connection, derived from provider metadata.
 * `isExpiringSoon` means the consent is still valid but has 7 or fewer days left.
 */
interface ConsentValidity {
  validFrom: string | null;
  validUntil: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

const parseValidDate = (raw: unknown): Date | null => {
  if (!raw) return null;
  const parsed = new Date(raw as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Computes consent validity from a connection's metadata.
 * Returns undefined when the metadata carries no `consentValidUntil`.
 * When `consentValidUntil` is present but unparseable, dates are null and the
 * consent is treated as neither expired nor expiring.
 */
export function computeConsentValidity({
  metadata,
  now = new Date(),
}: {
  metadata: unknown;
  now?: Date;
}): ConsentValidity | undefined {
  const meta = metadata as { consentValidUntil?: unknown; consentValidFrom?: unknown } | null | undefined;

  if (!meta?.consentValidUntil) return undefined;

  const validUntil = parseValidDate(meta.consentValidUntil);
  const validFrom = parseValidDate(meta.consentValidFrom);

  if (!validUntil) {
    return {
      validFrom: validFrom?.toISOString() || null,
      validUntil: null,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const msRemaining = validUntil.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const isExpired = msRemaining <= 0;
  const isExpiringSoon = !isExpired && daysRemaining <= 7;

  return {
    validFrom: validFrom?.toISOString() || null,
    validUntil: validUntil.toISOString(),
    daysRemaining: isExpired ? 0 : daysRemaining,
    isExpired,
    isExpiringSoon,
  };
}
