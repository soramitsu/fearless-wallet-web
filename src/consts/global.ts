const APP_WIDTH = 561;
const APP_HEIGHT = 600;
const APP_NAME = 'Fearless Wallet';
const COPYRIGHT = 'Copyright 2022-2023';
const AUTHOR = 'Soramitsu';
const AUTHOR_WEBSITE = '';
const AUTO_UPDATE_ASSETS_PRICE_MS = 1000 * 60 * 5;
const isProduction = process.env.NODE_ENV === 'production';

export {
  APP_HEIGHT,
  APP_NAME,
  APP_WIDTH,
  AUTHOR,
  AUTHOR_WEBSITE,
  AUTO_UPDATE_ASSETS_PRICE_MS,
  COPYRIGHT,
  isProduction,
};
