import { startWallet } from '@/bootstrap/startup';
import './popup.scss';
void startWallet(() => import('@/bootstrap/mountApp'));
