import { chrome } from '@extension-base/utils/crossenv';
import { extensionPreferenceStore, installVisualEffects } from '@/appearance/visualEffects';
import { startWallet } from '@/bootstrap/startup';
import '@/styles/fw-tokens.scss';
import '@/styles/fw-fonts.scss';
import '@/styles/_fw-effects.scss';
import './popup.scss';

// Before mount: the effects tier and contrast are on <html> from the synchronous mirror of the stored choice.
installVisualEffects({ store: extensionPreferenceStore(chrome) });
void startWallet(() => import('@/bootstrap/mountApp'));
