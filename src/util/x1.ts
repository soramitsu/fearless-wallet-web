import { IS_PRODUCTION } from '@/consts/global';

export class X1Api {
  public static getWidget() {
    if (IS_PRODUCTION)
      return {
        sdkUrl: 'https://x1ex.com/widgets/sdk.js',
        widgetId: 'sprkwdgt-WUQBA5U2',
      };

    return {
      sdkUrl: 'https://dev.x1ex.com/widgets/sdk.js',
      widgetId: 'sprkwdgt-WYL6QBNC',
    };
  }
}
