import { IS_PRODUCTION } from './global';

enum StepsKyc {
  Preview = 1,
  TermsAndConditions,
  Phone,
  Email,
  KycView,
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

export { UNSUPPORTED_COUNTRIES, RESEND_INTERVAL, OTP_CODE_LENGTH, StepsKyc, VerificationStatus, Status, KycStatus };
