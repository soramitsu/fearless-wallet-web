import { SessionTypes } from '@walletconnect/types';

export type AppSessionInitResponse = {
  uri?: string | undefined;
  approval: () => Promise<SessionTypes.Struct>;
};
