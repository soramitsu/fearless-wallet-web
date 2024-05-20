import axios from 'axios';
import type { ScamAddressList } from './types';
import type State from '@extension-base/background/handlers/State';
import { URLS } from '@/consts/urls';

export class ScamService {
  constructor(public state: State) {}

  async getScamAddressList() {
    const { data } = await axios.get<ScamAddressList>(URLS.SCAM);

    return data;
  }
}
