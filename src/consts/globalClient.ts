import { chrome } from '@extension-base/utils/crossenv';

import { APP_WIDTH, IS_EXTENSION } from './global';

function isToolbarPopup(): boolean {
  if (!IS_EXTENSION) return false;

  try {
    // Chrome can evaluate the entry module before it has sized the popup. Identify the
    // actual view instead of freezing that transient viewport width as its surface.
    return chrome?.extension?.getViews?.({ type: 'popup' })?.includes(window) ?? false;
  } catch {
    // Keep the existing layout fallback on browsers without this view API.
    return false;
  }
}

// sidepanel.html marks itself. Chrome's side panel is as tall as the browser and as wide as the person drags it.
const IS_SIDE_PANEL = IS_EXTENSION && document.documentElement.dataset.fwSurface === 'side-panel';
// The side panel shows the popup's page, in the popup's layout at any width; the wallet column stays 561px wide.
const IS_POPUP = IS_EXTENSION && (IS_SIDE_PANEL || isToolbarPopup() || window.innerWidth <= APP_WIDTH);

export { IS_POPUP, IS_SIDE_PANEL };
