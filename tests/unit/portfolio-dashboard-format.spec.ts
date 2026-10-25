import { formatChange, formatShare, splitTotal } from '@/portfolio/dashboard/format';

describe('splitTotal', () => {
  it('splits the cents off a grouped total', () => {
    expect(splitTotal('12480.55')).toEqual({ whole: '12,480', fraction: '55' });
    expect(splitTotal('0')).toEqual({ whole: '0', fraction: '00' });
    expect(splitTotal('1234567.891')).toEqual({ whole: '1,234,567', fraction: '89' });
  });

  it('shows a sub-cent value as zero rather than failing', () => {
    expect(splitTotal('0.001')).toEqual({ whole: '0', fraction: '00' });
    expect(splitTotal('not a number')).toEqual({ whole: '0', fraction: '00' });
  });
});

describe('formatChange', () => {
  it('signs a gain and a loss in the text, so the colour never carries it alone', () => {
    expect(formatChange('148.2', '1.2', '$')).toEqual({ direction: 'up', amountText: '+$148.20', percentText: '+1.2%' });
    expect(formatChange('-20', '-0.45', '$')).toEqual({ direction: 'down', amountText: '-$20.00', percentText: '-0.45%' });
  });

  it('reads nothing as flat, and so does a move that rounds to nothing', () => {
    expect(formatChange('0', '0', '$')).toEqual({ direction: 'flat', amountText: '$0.00', percentText: '0%' });
    expect(formatChange('0.01', '0.001', '€')).toMatchObject({ direction: 'flat', percentText: '0%' });
  });

  it('uses the fiat symbol it is given', () => {
    expect(formatChange('5', '1', '€').amountText).toBe('+€5.00');
  });

  it('treats missing values as zero', () => {
    expect(formatChange('', '', '$')).toMatchObject({ direction: 'flat', amountText: '$0.00' });
  });
});

describe('formatShare', () => {
  it('rounds to a whole percent and keeps a sliver visible', () => {
    expect(formatShare(18.6)).toBe('19');
    expect(formatShare(0.4)).toBe('<1');
    expect(formatShare(0)).toBe('0');
    expect(formatShare(100)).toBe('100');
  });
});
