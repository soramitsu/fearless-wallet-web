const UNSUPPORTED_COUNTRIES = {
  dz: 'Algeria',
  bd: 'Bangladesh',
  by: 'Belarus',
  bo: 'Bolivia',
  kh: 'Cambodia',
  cn: 'China',
  cu: 'Cuba',
  gh: 'Ghana',
  ir: 'Iran',
  jo: 'Jordan',
  kp: 'Korea',
  kg: 'Kyrgyzstan',
  mk: 'Macedonia',
  np: 'Nepal',
  ng: 'Nigeria',
  ru: 'Russian Federation',
  sd: 'Sudan',
  sy: 'Syria',
  th: 'Thailand',
  us: 'United States',
} as const;

const OTP_CODE_LENGTH = 6;
const RESEND_INTERVAL = 59;

export { UNSUPPORTED_COUNTRIES, RESEND_INTERVAL, OTP_CODE_LENGTH };
