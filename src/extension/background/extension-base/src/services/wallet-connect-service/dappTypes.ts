import { SessionTypes } from '@walletconnect/types';

export type AppSessionInitResponse = {
  uri?: string;
  approval: () => Promise<SessionTypes.Struct>;
};

export type PairingSubjectType = {
  uri?: string;
  status?: boolean;
  message?: string;
};
