import axios from 'axios';
import { parseSCV } from '@extension-base/utils/index';
import type { ScamAddressList } from '@extension-base/services/scam-service/types';
import type { RequestCheckScam } from '../../background/types/types';
import type State from '@extension-base/background/handlers/State';
import { URLS } from '@/consts/urls';

export class ScamService {
  scamList: Nullable<ScamAddressList>;

  constructor(public state: State) {
    this.refreshScamAddressList();
  }

  async refreshScamAddressList() {
    const { data } = await axios.get<string>(URLS.SCAM);

    this.scamList = parseSCV(data);
  }

  checkScamAddress(request: RequestCheckScam) {
    const { address, network } = request;

    return true;
  }
}
