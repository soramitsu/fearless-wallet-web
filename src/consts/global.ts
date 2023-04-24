const APP_WIDTH = 561;
const APP_HEIGHT = 600;
const APP_NAME = 'Fearless Wallet';
const COPYRIGHT = 'Copyright 2022-2023';
const AUTHOR = 'Soramitsu';
const AUTHOR_WEBSITE = '';
const AUTO_UPDATE_ASSETS_PRICE_MS = 1000 * 60 * 5;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const RAMP_API_KEY = IS_PRODUCTION ? process.env.RAMP_PROD_API_KEY : process.env.RAMP_TEST_API_KEY;
const MOONPAY_API_KEY = IS_PRODUCTION ? process.env.MOONPAY_PROD_API_KEY : process.env.MOONPAY_TEST_API_KEY;
const IS_EXTENSION = chrome.extension !== undefined;

export {
  APP_WIDTH,
  APP_HEIGHT,
  APP_NAME,
  AUTHOR,
  AUTHOR_WEBSITE,
  AUTO_UPDATE_ASSETS_PRICE_MS,
  COPYRIGHT,
  IS_PRODUCTION,
  RAMP_API_KEY,
  MOONPAY_API_KEY,
  IS_EXTENSION,
};
