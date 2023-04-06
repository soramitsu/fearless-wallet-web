import axios from 'axios';
import { loadScript, unloadScript } from 'vue-plugin-load-script';
import { IS_PRODUCTION } from '@/consts/global';

const getXorPerEuroRatio = async () => {
  try {
    const { data } = await axios.get('https://backend.dev.sora-card.tachi.soramitsu.co.jp/prices/xor_euro');

    return data.price;
  } catch (error) {
    console.error(error);
  }
};

function getSoraCardService() {
  if (IS_PRODUCTION)
    return {
      authService: {
        sdkURL: '',
        apiKey: '',
      },
      kycService: {
        sdkURL: '',
        username: '',
        pass: '',
        unifiedApiKey: '',
      },
      soraProxy: {
        referenceNumberEndpoint: '',
        lastKycStatusEndpoint: '',
        kycAttemptCountEndpoint: '',
        newAccessTokenEndpoint: '',
      },
    };

  return {
    authService: {
      sdkURL: 'https://auth-test.soracard.com/WebSDK/WebSDK.js',
      apiKey: '6974528a-ee11-4509-b549-a8d02c1aec0d',
    },
    kycService: {
      sdkURL: 'https://kyc-test.soracard.com/web/v2/webkyc.js',
      username: 'E7A6CB83-630E-4D24-88C5-18AAF96032A4',
      pass: '75A55B7E-A18F-4498-9092-58C7D6BDB333',
      unifiedApiKey: '6974528a-ee11-4509-b549-a8d02c1aec0d',
    },
    soraProxy: {
      referenceNumberEndpoint: 'https://backend.dev.sora-card.tachi.soramitsu.co.jp/get-reference-number',
      lastKycStatusEndpoint: 'https://backend.dev.sora-card.tachi.soramitsu.co.jp/kyc-last-status',
      kycAttemptCountEndpoint: 'https://backend.dev.sora-card.tachi.soramitsu.co.jp/kyc-attempt-count',
      newAccessTokenEndpoint: 'https://api-auth-test.soracard.com/RequestNewAccessToken',
    },
  };
}

const initPayWingsAuthSdk = async (setAuthLogin: (login: any) => void) => {
  const { authService } = getSoraCardService();

  await unloadScript(authService.sdkURL).catch(() => {
    /* no need to handle */
  });

  await loadScript(authService.sdkURL).then(() => {
    // TODO: annotate via TS main calls
    // @ts-expect-error no undefined
    const login = Paywings.WebSDK.create({
      Domain: 'soracard.com',
      UnifiedLoginApiKey: authService.apiKey,
      env: IS_PRODUCTION ? 'Prod' : 'Test',
      AccessTokenTypeID: 1,
      UserTypeID: 2,
      ClientDescription: 'Auth',
    });

    setAuthLogin(login);
  });
};

export { getXorPerEuroRatio, initPayWingsAuthSdk };
