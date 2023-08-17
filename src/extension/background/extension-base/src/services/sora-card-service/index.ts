import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import { BehaviorSubject } from 'rxjs';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import { getId } from '@extension-base/utils/utils';
import type { Port, AuthUrls } from '@extension-base/background/types/types';
import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';

export class SoraCardService {
  private readonly soraCardTokenSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

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

  public approvePolkaswap = async (authorizedAccounts: string[], authUrls: AuthUrls): Promise<void> => {
    const { POLKASWAP } = URLS;
    const stripedUrl = stripUrl(POLKASWAP);
    const origin = IS_PRODUCTION ? 'Polkaswap' : 'SubWallet Connect';

    authUrls[stripedUrl] = {
      authorizedAccounts,
      count: 0,
      id: getId(),
      origin,
      url: POLKASWAP,
      isAllowed: true,
      isAllowedMap: {},
    };
  };
}
