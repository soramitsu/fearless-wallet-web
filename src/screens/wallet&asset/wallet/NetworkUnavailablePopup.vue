<template>
  <NotificationPopup
    sizeWidth="big"
    rejectButtonText="common.cancel"
    acceptButtonText="accounts.switchNode"
    :headers="headers"
    :showWarningIcon="showWarningIcon"
    :showAcceptButton="haveMoreOneNodes"
    :showRejectButton="true"
    :handlerAccept="openSwitchNode"
    :handlerClose="close"
    :zIndex="500"
  >
    <Checkbox v-model="isDontShowAgain" size="big" label="common.dontShowAgain" class="dont-show-again" />
  </NotificationPopup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import type { Networks, Fn } from '@/interfaces';
import { Components } from '@/router/routes';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';

@Component
export default class NetworkUnavailablePopup extends Vue {
  isDontShowAgain = false;

  @Prop(Function) closePopup!: VoidFunction;
  @Prop(Array) networks!: Networks;
  @Prop(String) network!: string;
  @Mutation(AccountsMutationTypes.HIDE_NETWORK_WARNING) hideNetworkWarning!: Fn<string>;

  get headers() {
    return this.haveMoreOneNodes
      ? { text: 'common.resolveOption' }
      : { text: 'wallet.networkUnavailable', subtext: 'wallet.networkUnavailableSubtext' };
  }

  get haveMoreOneNodes() {
    return this.networks.find(({ name }) => name === this.network)!.nodes.length > 1;
  }

  get showWarningIcon() {
    return !this.haveMoreOneNodes;
  }

  openSwitchNode() {
    if (this.isDontShowAgain) this.hideNetworkWarning(this.network);

    this.$router.push({
      name: Components.Nodes,
      params: { network: this.network },
    });
  }

  close() {
    if (this.isDontShowAgain) this.hideNetworkWarning(this.network);

    this.closePopup();
  }
}
</script>

<style lang="scss" scoped>
.dont-show-again {
  margin: -10px 0 -20px;
}
</style>
