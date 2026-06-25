declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production';
      PORT?: string;
      OAUTH_CLIENT_ID: string;
      EXTENSION_PUBLIC_KEY: string;
      RAMP_TEST_API_KEY: string;
      RAMP_PROD_API_KEY: string;
      RAMP_TEST_API_KEY: string;
      MOONPAY_TEST_API_KEY: string;
      MOONPAY_PROD_API_KEY: string;
      FL_WEB_ETHERSCAN_API_KEY: string;
      FL_WEB_BSCSCAN_API_KEY: string;
      FL_WEB_POLYGONSCAN_API_KEY: string;
      FL_BLAST_API_ETHEREUM_KEY: string;
      FL_BLAST_API_BSC_KEY: string;
      FL_BLAST_API_SEPOLIA_KEY: string;
      FL_BLAST_API_GOERLI_KEY: string;
      FL_BLAST_API_POLYGON_KEY: string;
      FL_WEB_ALCHEMY_API_ETHEREUM_KEY: string;
      FL_BLAST_API_MOONBEAM_KEY: string;
      FL_BLAST_API_MOONRIVER_KEY: string;
      FL_BLAST_API_OKTC_MAINNET_KEY: string;
      FL_BLAST_API_OPTIMISM_MAINNET_KEY: string;
      FL_WEB_ARBISCAN_API_KEY: string;
      FL_WEB_OPTIMISTIC_ETHERSCAN_API_KEY: string;
      FL_WEB_SNOWTRACE_API_KEY: string;
      FL_WEB_ZKEVM_POLYGONSCAN_API_KEY: string;
      VUE_APP_FL_WEB_X1_TESTNET_API_KEY: string;
      FL_WEB_TON_API_KEY: string;
      FL_WEB_DWELLIR_API_KEY: string;
      FL_DWELLIR_API_KEY?: string;
    }
  }
}

export {};
