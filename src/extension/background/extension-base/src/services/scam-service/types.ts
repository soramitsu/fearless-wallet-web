export interface ScamInfo {
  name: string;
  reason: string;
  additional: string;
  address: string;
}

export type ScamAddressList = Map<string, ScamInfo>;

export enum Reasons {
  Scam = 'Scam',
  Donation = 'Donation ',
  Exchange = 'Exchange',
  Sanctions = 'Sanctions',
}
