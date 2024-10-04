import { IS_EXTENSION } from './global';

const IS_POPUP = window.innerWidth <= 561 && IS_EXTENSION;

export { IS_POPUP };
