import { APP_WIDTH, IS_EXTENSION } from './global';

const IS_POPUP = window.innerWidth <= APP_WIDTH && IS_EXTENSION;

export { IS_POPUP };
