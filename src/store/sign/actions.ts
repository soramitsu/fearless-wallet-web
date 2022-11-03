import { SigningRequest } from '@extension-base/background/types';
import type { ActionTree, ActionContext } from 'vuex';
import type { State } from '@/store/sign/state';
import { Mutations, MutationTypes } from '@/store/sign/mutations';
import { SubstrateSignPayloadResponse } from '@/interfaces';
import SignController from '@/controllers/signController';
import { cancelSignRequest, subscribeSigningRequests } from '@/extension/messaging';
import router from '@/router';
import { Components } from '@/router/routes';

export enum ActionTypes {
  SUBSCRIBE_SIGN_REQUESTS = 'SUBSCRIBE_SIGN_REQUESTS',
  SIGN_CANCEL = 'SIGN_CANCEL',
  APPROVE_SIGN_PASSWORD = 'APPROVE_SIGN_PASSWORD',
  SIGN_SIGNATURE = 'SIGN_SIGNATURE',
}

type AugmentedActionContext = {
  commit<K extends keyof Mutations>(key: K, payload?: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export type ApprovePayload = {
  id: string;
  isSavePass: boolean;
  password?: string;
};

export type Actions = {
  [ActionTypes.SUBSCRIBE_SIGN_REQUESTS](context: AugmentedActionContext): Promise<void>;
  [ActionTypes.SIGN_CANCEL](context: AugmentedActionContext, id: string): Promise<void>;
  [ActionTypes.APPROVE_SIGN_PASSWORD](context: AugmentedActionContext, payload: ApprovePayload): Promise<void>;
  [ActionTypes.SIGN_SIGNATURE](
    context: AugmentedActionContext,
    payload: { payload: SubstrateSignPayloadResponse['blockchainData']; id: string }
  ): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.SUBSCRIBE_SIGN_REQUESTS]({ commit }) {
    const callback = (requests: SigningRequest[]) => {
      const [request] = requests;

      if (request) {
        commit(MutationTypes.SET_SIGN_REQUEST, request);

        router.push({
          name: Components.Transaction,
        });
      }
    };

    subscribeSigningRequests(callback);
  },

  async [ActionTypes.APPROVE_SIGN_PASSWORD]({ commit }, { id, isSavePass, password }) {
    SignController.approveSignPassword(id, isSavePass, password);

    commit(MutationTypes.DELETE_SIGN_REQUEST);

    router.push({ name: Components.Wallet });
  },

  async [ActionTypes.SIGN_SIGNATURE]({ commit }, { payload, id }) {
    SignController.approveSignSignature(id, payload.signature);

    commit(MutationTypes.DELETE_SIGN_REQUEST);

    router.push({ name: Components.Wallet });
  },

  async [ActionTypes.SIGN_CANCEL]({ commit }, id) {
    cancelSignRequest(id);
    commit(MutationTypes.DELETE_SIGN_REQUEST);

    router.push({ name: Components.Wallet });
  },
};

export default actions;
