type CodecString = string;

/**
 * Account Balance structure. Each value === value * 10 ^ decimals
 *
 * total = free + reserved
 *
 * locked = max(miscFrozen, feeFrozen)
 *
 * transferable = free - locked
 *
 * frozen = locked + reserved
 */
type AccountBalance = {
  reserved: CodecString;
  total: CodecString;
  locked: CodecString;
  transferable: CodecString;
  frozen: CodecString;
};

export { AccountBalance };
