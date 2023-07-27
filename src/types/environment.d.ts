declare global {
  namespace NodeJS {
    interface ProcessEnv {
      VUE_CLI_SERVICE_CONFIG_PATH: string;
      NODE_ENV: 'development' | 'production';
      PORT?: string;
      PORT_PREFIX: string;
      EXTENSION_PREFIX: string;
      OAUTH_CLIENT_ID: string;
      EXTENSION_PUBLIC_KEY: string;
      RAMP_TEST_API_KEY: string;
      RAMP_PROD_API_KEY: string;
      RAMP_TEST_API_KEY: string;
      MOONPAY_TEST_API_KEY: string;
      MOONPAY_PROD_API_KEY: string;
      BSCSCAN_API_KEY: string;
      ETHERSCAN_API_KEY: string;
    }
  }
}

export {};
