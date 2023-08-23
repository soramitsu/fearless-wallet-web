<template>
  <AboveForm :fullScreen="true" :showBackIcon="true" :closeHandler="onBack" :handlerBack="onBack">
    <div class="wc-init-form">
      <Input v-model="uri" :placeholder="placeholder" size="big" />

      <Button text="Submit" size="big" fontSize="big" :border="false" @click="onSubmit" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { newConnection } from '@/extension/messaging';
import { getClipboard } from '@/helpers';

@Component({})
export default class WalletConnectInit extends Vue {
  placeholder = 'insert wallet connect url';
  uri = '';

  async mounted() {
    const clipboard = getClipboard();

    if (clipboard.startsWith('wc:')) this.uri = clipboard;
  }

  onSubmit() {
    newConnection({ uri: this.uri });
  }

  onBack() {
    this.$router.back();
  }
}
</script>
<style lang="scss" scoped>
.wc-init-form {
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  height: 100%;
}
</style>
