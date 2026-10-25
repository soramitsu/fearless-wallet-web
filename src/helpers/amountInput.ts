// What an amount field shows and keeps. The field shows the typed amount with its whole part grouped by thousands
// ("1,250.5") and keeps the plain decimal ("1250.5"). Both work on the text alone: no number type ever rounds,
// pads or reformats what the user typed.

// Digits with at most one decimal point. An empty field, "5." and "." are steps while typing.
const PLAIN_DECIMAL = /^\d*(?:\.\d*)?$/u;

export function isAmountInputText(value: string): boolean {
  return PLAIN_DECIMAL.test(value);
}

function groupWholePart(whole: string): string {
  // Leading zeros are not shown ("007" reads 7), but a lone zero stays ("0.5").
  const digits = whole.replace(/^0+(?=\d)/u, '') || '0';

  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** The field text for a kept amount: "1250.5" shows as "1,250.5", "5." as "5.", "" as "". */
export function formatAmountInput(amount: string): string {
  if (amount === '' || !isAmountInputText(amount)) return amount;

  const [whole, fraction] = amount.split('.');
  const grouped = groupWholePart(whole);

  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/**
 * The amount to keep for what the field now holds, or `previous` when the text is not an amount. Grouping commas and
 * spaces are dropped. A comma after the decimal point means another number format ("1.234,56"), so that text is
 * refused rather than read as a different amount.
 */
export function readAmountInput(text: string, previous: string): string {
  const compact = text.replace(/\s/gu, '');
  const point = compact.indexOf('.');

  if (point >= 0 && compact.includes(',', point)) return previous;

  const value = compact.replaceAll(',', '');

  return isAmountInputText(value) ? value : previous;
}
