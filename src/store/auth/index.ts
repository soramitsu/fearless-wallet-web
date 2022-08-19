import actions from '@/store/auth/actions';
import getters from '@/store/auth/getters';
import mutations from '@/store/auth/mutations';
import state from './state';

const auth = {
  state,
  mutations,
  actions,
  getters,
};

export default auth;
