import { installVisualEffects } from '@/appearance/visualEffects';
import { prepareWebWorker, startWallet } from '@/bootstrap/startup';
import '@/styles/fw-tokens.scss';
import '@/styles/fw-fonts.scss';
import '@/styles/_fw-effects.scss';

// Before mount: the web wallet keeps the effects choice in localStorage only.
installVisualEffects();
void startWallet(() => import('@/bootstrap/mountApp'), prepareWebWorker);
