import { APP_WIDTH, IS_EXTENSION } from './global';

// sidepanel.html marks itself. Chrome's side panel is as tall as the browser and as wide as the person drags it.
const IS_SIDE_PANEL = IS_EXTENSION && document.documentElement.dataset.fwSurface === 'side-panel';
// The side panel shows the popup's page, in the popup's layout at any width; the wallet column stays 561px wide.
const IS_POPUP = IS_EXTENSION && (IS_SIDE_PANEL || window.innerWidth <= APP_WIDTH);

export { IS_POPUP, IS_SIDE_PANEL };
