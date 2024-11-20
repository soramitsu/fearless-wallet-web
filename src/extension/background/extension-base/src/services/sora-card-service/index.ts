import { BehaviorSubject } from 'rxjs';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { getId } from '@extension-base/utils/utils';
import type { RequestService } from '@extension-base/services/request-service';
import type { Port } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';

export class SoraCardService {
  private readonly soraCardTokenSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

  constructor(private requestService: RequestService, private state: State) {}

  public get tokenSubject() {
    return this.soraCardTokenSubject;
  }

  public async soraCardTokenSubscribe(id: string, port?: Port): Promise<boolean> {
    const cb = this.state.subscriptionService.createSubscription<'pri(soraCard.token)'>(id, port);

    const tokenSubscription = this.tokenSubject.subscribe((token) => cb(token));

    this.state.subscriptionService.setUnsubscriptionHandle(id, tokenSubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    return true;
  }

  public approvePolkaswap = async (authorizedAccounts: string[]): Promise<void> => {
    this.requestService.getAuthorize((authUrls) => {
      const { POLKASWAP } = URLS;
      const stripedUrl = stripUrl(POLKASWAP);
      const origin = IS_PRODUCTION ? 'Polkaswap' : 'Fearless Wallet Connect';

      authUrls[stripedUrl] = {
        authorizedAccounts,
        evmAuthorizedAccount: '',
        count: 0,
        id: getId(),
        origin,
        url: POLKASWAP,
        isAllowed: true,
        allowedAccountsMap: {},
      };

      this.requestService.setAuthorize(authUrls);
    });
  };
}
