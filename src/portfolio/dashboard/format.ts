import { FPNumber } from '@sora-substrate/util';
import { formatDecimalString } from '@/helpers/numbers';

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface FormattedChange {
  direction: ChangeDirection;
  /** `+$148.20`, `-$20.00` or `$0.00`; the sign is part of the text, so colour never carries the direction alone. */
  amountText: string;
  /** `+1.2%`, `-0.45%` or `0%`. */
  percentText: string;
}

/** The whole and cent parts of a fiat total, so the cents can be set smaller: `12,480` and `55`. */
export function splitTotal(value: string): { whole: string; fraction: string } {
  const text = formatDecimalString(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const point = text.lastIndexOf('.');

  // Only a value the formatter cannot read comes back without cents: it reads as zero, never as a gap.
  return point === -1 ? { whole: text, fraction: '00' } : { whole: text.slice(0, point), fraction: text.slice(point + 1) };
}

const absolute = (value: FPNumber): FPNumber => (value.isLtZero() ? value.mul(new FPNumber('-1')) : value);

/** The 24 h change as the hero shows it. A change that rounds to nothing reads as flat, not as a tiny move. */
export function formatChange(amount: string, percent: string, fiatSymbol: string): FormattedChange {
  const percentValue = new FPNumber(String(percent || '0'));
  const amountValue = new FPNumber(String(amount || '0'));
  const percentRounds = formatDecimalString(absolute(percentValue).toString(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const direction: ChangeDirection =
    percentRounds === '0' || percentValue.isZero() ? 'flat' : percentValue.isGtZero() ? 'up' : 'down';
  const sign = direction === 'up' ? '+' : direction === 'down' ? '-' : '';
  const money = formatDecimalString(absolute(amountValue).toString(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    direction,
    amountText: `${sign}${fiatSymbol}${money}`,
    percentText: `${sign}${formatDecimalString(absolute(percentValue).toString(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`,
  };
}

/** A share of the total as the legend says it: whole percent, and `<1` for a sliver that would round to nothing. */
export const formatShare = (share: number): string => (share > 0 && share < 1 ? '<1' : String(Math.round(share)));
