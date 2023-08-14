<template>
  <div>
    <Input v-model="uri" :placeholder="placeholder" size="small" />

    <Button text="Submit" width="48%" size="big" fontSize="big" type="secondary" :border="false" @click="onSubmit" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { newConnection } from '@/extension/messaging';

@Component({})
export default class WalletConnectInit extends Vue {
  placeholder = 'insert wallet connect url';
  uri = '';

  onSubmit() {
    newConnection({ uri: this.uri });
  }
}
</script>
<style></style>
