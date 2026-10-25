import type { CanonicalMemberRole } from '@/portfolio/canonicalGroups';
import { formatDecimalString } from '@/helpers/numbers';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

const ROLE_LABELS: Record<string, string> = {
  native: 'portfolioPage.role.native',
  'app-owned-native': 'portfolioPage.role.native',
  'system-parachain': 'portfolioPage.role.systemParachain',
  'xcm-reserve': 'portfolioPage.role.xcmReserve',
  'canonical-rollup': 'portfolioPage.role.rollup',
  'issuer-native': 'portfolioPage.role.issuerNative',
};

/** The locale key of a group member's role, or `undefined` for a role this build has no label for. */
export const memberRoleLabelKey = (role: CanonicalMemberRole | undefined): string | undefined =>
  role ? ROLE_LABELS[role] : undefined;

/** Amount, fiat and role formatting shared by the portfolio rows of both lenses. */
export function usePortfolioFormatting() {
  const { t } = useI18n();
  const accountsStore = useAccountsStore();

  const formatAmount = (value: string): string =>
    formatDecimalString(value, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
      preserveSmallValue: true,
    });

  const formatFiatValue = (value: string): string =>
    `${accountsStore.fiatSymbol}${formatDecimalString(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatFiat = (value: string | null): string =>
    value === null ? t('portfolioPage.priceUnavailable') : formatFiatValue(value);

  const roleLabel = (role: CanonicalMemberRole | undefined): string => {
    const key = memberRoleLabelKey(role);
    return key ? t(key) : '';
  };

  return { formatAmount, formatFiat, formatFiatValue, roleLabel };
}
