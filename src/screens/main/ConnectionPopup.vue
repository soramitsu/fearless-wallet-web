<template>
  <Popup
    :showHeader="true"
    sizeWidth="big"
    :showBorder="true"
    :headerText="activeTabName"
    :closeByBackground="true"
    zIndex="299"
    @handlerClose="$emit('handlerClose')"
  >
    <div class="notification-popup-content">
      <div class="message">{{ message }}</div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';


export default defineComponent({ name: 'ConnectionPopup' ,
  props: {
    tabStatus: Object,
  },
  computed: {
    message() {
      if (this.tabStatus.isAuthorize) {
            const count = this.tabStatus.authorizeAccountsCount;
            const tc = count === 1 ? 1 : 2;

            return this.$tc('header.connectedMessage', tc, { count });
          }

          return this.$t('header.connectionStatusMessage', {
            not: this.tabStatus.isAuthorize ? '' : 'not',
          });
    },
    activeTabName() {
      return this.tabStatus.dAppName === 'header.currentExtensionPage'
            ? this.$t(this.tabStatus.dAppName)
            : this.tabStatus.dAppName;
    },
    classesSubtext() {
      return ['subtext', `subtext-big`];
    },
  },
});
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
