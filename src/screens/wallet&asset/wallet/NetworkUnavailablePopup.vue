<template>
  <NotificationPopup
    sizeWidth="big"
    rejectButtonText="common.cancel"
    acceptButtonText="accounts.switchNode"
    :headers="headers"
    :showWarningIcon="showWarningIcon"
    :showAcceptButton="haveMoreOneNodes"
    :showRejectButton="true"
    @handlerAccept="openSwitchNode"
    @handlerClose="close"
    :zIndex="500"
  >
    <Checkbox
      :value="isDontShowAgain"
      size="big"
      :label="$t('common.dontShowAgain')"
      class="dont-show-again"
      @change="onChange"
    />
  </NotificationPopup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { NetworkJson } from '@extension-base/types';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class NetworkUnavailablePopup extends Vue {
  accountsStore = useAccountsStore();
  isDontShowAgain = false;

  @Prop(Array) networks!: NetworkJson[];
  @Prop(String) network!: string;

  get headers() {
    return this.haveMoreOneNodes
      ? { text: 'common.resolveOption' }
      : { text: 'wallet.networkUnavailable', subtext: 'wallet.networkUnavailableSubtext' };
  }

  get haveMoreOneNodes() {
    return this.networks.find(({ name }) => name.toLowerCase() === this.network.toLowerCase())!.nodes.length > 1;
  }

  get showWarningIcon() {
    return !this.haveMoreOneNodes;
  }

  openSwitchNode() {
    if (this.isDontShowAgain) this.accountsStore.hideNetworkWarning(this.network);

    this.$router.push({
      name: Components.Nodes,
      params: { network: this.network },
    });
  }

  close() {
    if (this.isDontShowAgain) this.accountsStore.hideNetworkWarning(this.network);

    this.$emit('closePopup');
  }

  onChange(value: boolean) {
    this.isDontShowAgain = value;
  }
}
</script>

<style lang="scss" scoped>
.dont-show-again {
  margin: -10px 0 -20px;
}
</style>
