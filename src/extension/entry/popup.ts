import { chrome } from '@extension-base/utils/crossenv';
import { extensionPreferenceStore, installVisualEffects } from '@/appearance/visualEffects';
import { startWallet } from '@/bootstrap/startup';
import { IS_SIDE_PANEL } from '@/consts/globalClient';
import { markSidePanelWorking } from '@/extension/toolbarSurface';
import '@/styles/fw-tokens.scss';
import '@/styles/fw-fonts.scss';
import '@/styles/_fw-effects.scss';
import './popup.scss';

// Before mount: the effects tier and contrast are on <html> from the synchronous mirror of the stored choice.
installVisualEffects({ store: extensionPreferenceStore(chrome) });
// Before the wallet loads, so a toolbar click waiting to fall back to the popup sees that the panel opened.
if (IS_SIDE_PANEL) markSidePanelWorking(chrome).catch(() => undefined);
void startWallet(() => import('@/bootstrap/mountApp'));
