import { createSubscription, unsubscribe } from '@extension-base/services';
import { BehaviorSubject } from 'rxjs';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { getId } from '@extension-base/utils/utils';
import type { RequestService } from '@extension-base/services/request-service';
import type { Port } from '@extension-base/background/types/types';
import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';

export class SoraCardService {
  private readonly soraCardTokenSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  requestService: RequestService;

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  public get tokenSubject() {
    return this.soraCardTokenSubject;
  }

  public async soraCardTokenSubscribe(id: string, port: Port): Promise<boolean> {
    const cb = createSubscription<'pri(soraCard.token)'>(id, port);

    const subscription = this.tokenSubject.subscribe((token) => cb(token));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  public approvePolkaswap = async (authorizedAccounts: string[]): Promise<void> => {
    this.requestService.getAuthorize((authUrls) => {
      const { POLKASWAP } = URLS;
      const stripedUrl = stripUrl(POLKASWAP);
      const origin = IS_PRODUCTION ? 'Polkaswap' : 'Fearless Wallet Connect';

      authUrls[stripedUrl] = {
        authorizedAccounts,
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
