import { SigningRequest } from '@polkadot/extension-base/background/types';

export type State = {
  requests: SigningRequest[];
  savePass: boolean;
};
