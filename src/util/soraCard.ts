import axios from 'axios';
import { loadScript, unloadScript } from 'vue-plugin-load-script';
import { v4 as uuidv4 } from 'uuid';
import { getBalanceItem } from '@extension-base/background/utils/utils';
import jwtDecode from 'jwt-decode';
import { FPNumber } from '@sora-substrate/util';
import { TokenBalance } from '@extension-base/background/types/types';
import type { JwtPayload } from 'jwt-decode';
import type { Status } from '@/consts/soraCard';
import { IS_PRODUCTION } from '@/consts/global';
import { soraCardController } from '@/controllers';
import { VerificationStatus, KycStatus } from '@/consts/soraCard';
import { subscribeSoraCardToken } from '@/extension/messaging';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { SEC1 } from '@/consts/time';

type XorRestPrice = {
  euroToPay: string;
  euroToPayInXor: string;
};

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
      env: IS_PRODUCTION ? 'Prod' : 'Test',
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
    env: IS_PRODUCTION ? 'Prod' : 'Test',
  };
}

const emptyStatusFields: Status = {
  verificationStatus: undefined,
  kycStatus: undefined,
};

const isAccessTokenExpired = (accessToken: string): boolean => {
  try {
    const decoded: JwtPayload = jwtDecode(accessToken);

    if (decoded.exp) {
      if (Date.now() <= decoded.exp * SEC1) {
        return false;
      }
    }

    return true;
  } catch {
    return true;
  }
};

async function getUpdatedJwtPair(refreshToken: string): Promise<Nullable<string>> {
  const {
    authService: { apiKey },
    soraProxy: { newAccessTokenEndpoint },
  } = getSoraCardService();
  const buffer = Buffer.from(apiKey);

  try {
    const response = await fetch(newAccessTokenEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${buffer.toString('base64')}, Bearer ${refreshToken}`,
      },
    });

    if (response.status === 200 && response.ok === true) {
      const accessToken = response.headers.get('accesstoken');

      if (accessToken) soraCardController.setPWToken(accessToken);

      return accessToken;
    }
  } catch (error) {
    console.error('[SoraCard]: Error while getting new JWT pair', error);
  }

  return null;
}

async function getUserStatus(accessToken: string): Promise<Status> {
  if (!accessToken) return emptyStatusFields;

  try {
    const {
      soraProxy: { lastKycStatusEndpoint },
    } = getSoraCardService();

    const result = await fetch(lastKycStatusEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const lastRecord = await result.json();

    if (!lastRecord) return emptyStatusFields;

    const verificationStatus: VerificationStatus = lastRecord.verification_status;
    const kycStatus: KycStatus = lastRecord.kyc_status;
    const rejectReason: string = lastRecord.additional_description;

    if (Object.keys(VerificationStatus).includes(verificationStatus) && Object.keys(KycStatus).includes(kycStatus)) {
      return { verificationStatus, kycStatus, rejectReason };
    }

    return emptyStatusFields;
  } catch (error) {
    console.error('[SoraCard]: Error while getting KYC and verification statuses', error);

    return emptyStatusFields;
  }
}

const getFreeKycAttemptCount = async () => {
  const sessionRefreshToken = localStorage.getItem('PW-refresh-token');
  let sessionAccessToken = localStorage.getItem('PW-token');

  if (!(sessionAccessToken && sessionRefreshToken)) {
    return null;
  }

  if (isAccessTokenExpired(sessionAccessToken)) {
    const accessToken = await getUpdatedJwtPair(sessionRefreshToken);

    if (accessToken) {
      sessionAccessToken = accessToken;
    } else {
      return null;
    }
  }

  try {
    const {
      soraProxy: { kycAttemptCountEndpoint },
    } = getSoraCardService();

    const result = await fetch(kycAttemptCountEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionAccessToken}`,
      },
    });

    const { free_attempt: freeAttempt } = await result.json();

    return freeAttempt;
  } catch (error) {
    console.error('[SoraCard]: Error while getting KYC attempt', error);
  }
};

// Defines user's KYC status.
// If accessToken expired, tries to get new JWT pair via refreshToken;
// if not, forces user to pass phone number again to create new JWT pair in localStorage.
async function defineUserStatus(): Promise<Status> {
  const sessionRefreshToken = soraCardController.getPWRefreshToken();
  let sessionAccessToken = soraCardController.getPWToken();

  if (!(sessionAccessToken && sessionRefreshToken)) {
    return emptyStatusFields;
  }

  if (isAccessTokenExpired(sessionAccessToken)) {
    const accessToken = await getUpdatedJwtPair(sessionRefreshToken);

    if (accessToken) {
      sessionAccessToken = accessToken;
    } else {
      return emptyStatusFields;
    }
  }

  const { kycStatus, verificationStatus, rejectReason } = await getUserStatus(sessionAccessToken);

  return { kycStatus, verificationStatus, rejectReason };
}

const initPayWingsAuthSdk = async (setAuthLogin: (login: any) => void) => {
  const { authService, env } = getSoraCardService();

  await unloadScript(authService.sdkURL).catch(() => {
    /* no need to handle */
  });

  await loadScript(authService.sdkURL).then(() => {
    // @ts-expect-error no undefined
    const login = Paywings.WebSDK.create({
      Domain: 'soracard.com',
      UnifiedLoginApiKey: authService.apiKey,
      env,
      AccessTokenTypeID: 1,
      UserTypeID: 2,
      ClientDescription: 'Auth',
    });

    setAuthLogin(login);
  });
};

async function getReferenceNumber(URL: string, confirmKyc: (value: boolean) => void): Promise<string | undefined> {
  const { kycService } = getSoraCardService();
  const token = soraCardController.getPWToken();

  try {
    const { data } = await axios.post(
      URL,
      {
        ReferenceID: uuidv4(),
        MobileNumber: '',
        Email: '',
        AddressChanged: false,
        DocumentChanged: false,
        IbanTypeID: null,
        CardTypeID: null,
        AdditionalData: '',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return data.ReferenceNumber;
  } catch (data) {
    console.error('[SoraCard]: Error while initiating KYC', data);

    confirmKyc(false);
    unloadScript(kycService.sdkURL);
  }
}

const initWebKyc = async (confirmKyc: (value: boolean) => void) => {
  const { kycService, soraProxy, env } = getSoraCardService();
  const referenceNumber = await getReferenceNumber(soraProxy.referenceNumberEndpoint, confirmKyc);

  await unloadScript(kycService.sdkURL).catch(() => null);

  loadScript(kycService.sdkURL)
    .then(() => {
      // @ts-expect-error no-undef
      Paywings.WebKyc.create({
        KycCredentials: {
          Username: kycService.username,
          Password: kycService.pass,
          Domain: 'soracard.com',
          env,
          UnifiedLoginApiKey: kycService.unifiedApiKey,
        },
        KycSettings: {
          AppReferenceID: uuidv4(),
          Language: 'en',
          ReferenceNumber: referenceNumber,
          ElementId: '#kyc',
          Logo: '',
          WelcomeHidden: false,
          WelcomeTitle: '',
          DocumentCheckWindowHeight: '50vh',
          DocumentCheckWindowWidth: '100%',
          HideLoader: true,
        },
        KycUserData: {
          FirstName: '',
          MiddleName: '',
          LastName: '',
          Email: '',
          MobileNumber: '',
          Address1: '',
          Address2: '',
          Address3: '',
          ZipCode: '',
          City: '',
          State: '',
          CountryCode: '',
        },
        UserCredentials: {
          AccessToken: soraCardController.getPWToken(),
          RefreshToken: soraCardController.getPWRefreshToken(),
        },
      })
        .on('Error', (data: any) => {
          console.error('[SoraCard]: Error while initiating KYC', data);

          confirmKyc(false);
          unloadScript(kycService.sdkURL);
        })
        .on('Success', () => {
          confirmKyc(true);
          unloadScript(kycService.sdkURL);
        });
    })
    .catch(() => null);
};

const subscribeCardToken = async (checkStatus: () => Promise<void>) => {
  const callback = async (token: string) => {
    soraCardController.setPWRefreshToken(token);

    checkStatus();
  };

  return subscribeSoraCardToken(callback);
};

const calculateXOREuroBalance = ({ balances }: TokenBalance, xorPerEuroRatio: FPNumber): number => {
  const balance = getBalanceItem(balances, SORA_NETWORK_NAME);
  const xorTotalBalance = balance?.muchTotal ?? FPNumber.ZERO;
  const xorBalanceInEuros = new FPNumber(xorTotalBalance).mul(xorPerEuroRatio).toNumber();

  return xorBalanceInEuros;
};

const calculateXorRestPrice = ({ balances }: TokenBalance, xorPerEuroRatio: FPNumber): XorRestPrice => {
  const balance = getBalanceItem(balances, SORA_NETWORK_NAME);
  const xorTotalBalance = new FPNumber(balance?.total ?? 0);

  const euroToPay = FPNumber.HUNDRED.add(FPNumber.ONE).sub(xorTotalBalance.mul(xorPerEuroRatio));
  const euroToPayInXor = euroToPay.div(xorPerEuroRatio);

  return {
    euroToPay: euroToPay.toString(),
    euroToPayInXor: euroToPayInXor.toString(),
  };
};

const isValidEuroBalanceXor = (xorBalanceInEuros: number): boolean => {
  return FPNumber.gte(new FPNumber(xorBalanceInEuros), new FPNumber(95));
};

export {
  getXorPerEuroRatio,
  initPayWingsAuthSdk,
  getSoraCardService,
  initWebKyc,
  defineUserStatus,
  getFreeKycAttemptCount,
  subscribeCardToken,
  calculateXOREuroBalance,
  calculateXorRestPrice,
  isValidEuroBalanceXor,
};
