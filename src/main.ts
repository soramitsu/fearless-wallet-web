import { prepareWebWorker, startWallet } from '@/bootstrap/startup';
void startWallet(() => import('@/bootstrap/mountApp'), prepareWebWorker);
