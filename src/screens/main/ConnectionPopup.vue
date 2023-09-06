<template>
  <Popup
    :showHeader="true"
    :handlerClose="handlerClose"
    sizeWidth="big"
    :showBorder="true"
    :headerText="activeTabName"
    :closeByBackground="true"
    zIndex="299"
  >
    <div class="notification-popup-content">
      <div class="message">{{ message }}</div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { ActiveTabAuthorizeStatus } from '@extension-base/background/types/types';

@Component
export default class ConnectionPopup extends Vue {
  @Prop(Object) tabStatus!: ActiveTabAuthorizeStatus;
  @Prop(Function) handlerClose!: VoidFunction;

  get message() {
    if (this.tabStatus.isAuthorize) {
      const count = this.tabStatus.authorizeAccountsCount;
      const tc = count === 1 ? 1 : 2;

      return this.$tc('header.connectedMessage', tc, { count });
    }

    return this.$t('header.connectionStatusMessage', {
      not: this.tabStatus.isAuthorize ? '' : 'not',
    });
  }

  get activeTabName() {
    return this.tabStatus.dAppName === 'header.currentExtensionPage'
      ? this.$t(this.tabStatus.dAppName)
      : this.tabStatus.dAppName;
  }

  get classesSubtext() {
    return ['subtext', `subtext-big`];
  }
}
</script>

<style lang="scss" scoped>
.notification-popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

.message {
  color: $gray-color;
  line-height: 150%;
  width: 300px;
}
</style>
