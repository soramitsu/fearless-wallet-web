import axios from 'axios';
import { Reasons, type ScamAddressList } from '@extension-base/services/scam-service/types';
import type { RequestCheckScam, ResponseCheckScam } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { URLS } from '@/consts/urls';
import { POLKADOT } from '@/consts/networks';
import { isSameString } from '@/helpers';

export class ScamService {
  scamMap: Nullable<ScamAddressList>;

  constructor(public state: State) {
    this.refreshScamAddressList();
  }

  async refreshScamAddressList() {
    const { data } = await axios.get<string>(URLS.SCAM);

    this.scamMap = this.parseSCV(data);
  }

  checkScamAddress(request: RequestCheckScam): ResponseCheckScam {
    const { address, network } = request;

    const addressPolkadot = this.state.formatAddress({ address: address, ethereumAddress: address }, POLKADOT);
    const info = this.scamMap?.get(addressPolkadot);

    // Если нет информации об адресе, значит он чистый
    if (info === undefined) return { value: false };

    // Если информации об адресе есть, то:
    // Если проверка адреса для сети Polkadot, то адрес скам
    if (isSameString(network, POLKADOT)) return { value: true, info };

    // Если проверка не для сети Polkadot, то адрес скам если reason === Scam
    if (info.reason === Reasons.Scam) return { value: true, info };

    return { value: false };
  }

  parseSCV(data: string): ScamAddressList {
    const dataSplit = data.split('\n').splice(1);

    return dataSplit.reduce((result, item) => {
      const [name, address, reason, additional] = item.split(',');

      result.set(address, { name, reason, additional, address });

      return result;
    }, new Map());
  }
}
