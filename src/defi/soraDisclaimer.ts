export const SORA_DISCLAIMER_VERSION = 1;

export type SoraDisclaimerAcceptance = {
  version: number;
  acceptedAt: number;
};

export type SoraDisclaimerStatus = {
  version: number;
  accepted: boolean;
  acceptedAt?: number;
};
