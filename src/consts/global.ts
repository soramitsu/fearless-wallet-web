import packages from '../../package.json';
import { MIN1 } from '@/consts/time';

const APP_WIDTH = 561;
const APP_HEIGHT = 600;
const APP_NAME = 'Fearless Wallet';
const COPYRIGHT = 'Copyright 2022-2023';
const AUTHOR = 'Soramitsu';
const AUTHOR_WEBSITE = '';
const AUTO_UPDATE_ASSETS_PRICE_MS = MIN1 * 5;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_TEST_ONLY = process.env.VUE_APP_TEST_ONLY === 'true';
const RAMP_API_KEY = IS_PRODUCTION ? process.env.RAMP_PROD_API_KEY : process.env.RAMP_TEST_API_KEY;
const MOONPAY_API_KEY = IS_PRODUCTION ? process.env.MOONPAY_PROD_API_KEY : process.env.MOONPAY_TEST_API_KEY;
const IS_EXTENSION = process.env.IS_EXTENSION !== undefined ? process.env.IS_EXTENSION === 'true' : true;
const APP_VERSION = packages.version;
const CONTENT_FORM_HEIGHT = 382;
const FEARLESS_TITLE = 'FEARLESS';

export {
  FEARLESS_TITLE,
  APP_WIDTH,
  APP_HEIGHT,
  APP_NAME,
  AUTHOR,
  AUTHOR_WEBSITE,
  AUTO_UPDATE_ASSETS_PRICE_MS,
  COPYRIGHT,
  IS_PRODUCTION,
  IS_TEST_ONLY,
  RAMP_API_KEY,
  MOONPAY_API_KEY,
  IS_EXTENSION,
  APP_VERSION,
  CONTENT_FORM_HEIGHT,
};
