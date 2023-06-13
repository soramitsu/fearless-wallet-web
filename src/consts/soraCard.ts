import { IS_PRODUCTION } from './global';

enum StepsKyc {
  Preview = 1,
  TermsAndConditions,
  Phone,
  Email,
  KycView,
  KycPrepare,
  Status,
}

enum KycStatus {
  Started = 'Started',
  Completed = 'Completed',
  Failed = 'Failed',
  Rejected = 'Rejected',
  Successful = 'Successful',
}

enum VerificationStatus {
  Pending = 'Pending',
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  None = 'None',
}

interface Status {
  verificationStatus: Nullable<VerificationStatus>;
  kycStatus: Nullable<KycStatus>;
  rejectReason?: Nullable<string>;
}

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
const RESEND_INTERVAL = IS_PRODUCTION ? 59 : 10;
const SORA_CARD_BANNER_HEIGHT = 120; // height + margin-bottom
const SORA_CARD_BANNER_RERUN = 1000 * 60 * 60 * 24 * 7;

export {
  UNSUPPORTED_COUNTRIES,
  RESEND_INTERVAL,
  OTP_CODE_LENGTH,
  SORA_CARD_BANNER_HEIGHT,
  SORA_CARD_BANNER_RERUN,
  StepsKyc,
  VerificationStatus,
  Status,
  KycStatus,
};
