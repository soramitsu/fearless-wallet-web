<template>
  <Popup :headerText="headerText" :showBorder="true" :handlerClose="closePopup" sizeWidth="big">
    <div class="buy-content">
      <Button
        v-for="provider in providers"
        class="provider-button"
        :key="provider"
        :text="provider"
        :iconName="provider"
        @click="openProvider(provider)"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from '@/components/Popup.vue';
import Button from '@/components/Button.vue';
import { getProviderUrl } from '@/helpers/currencies';

@Component({
  components: {
    Popup,
    Button,
  },
})
export default class SettingsPopup extends Vue {
  @Prop(String) token!: string;
  @Prop(String) address!: string;
  @Prop(Array) providers!: string[];
  @Prop(Function) closePopup!: VoidFunction;

  get headerText() {
    return `Buy ${this.token.toUpperCase()} with`;
  }

  openProvider(providerName: string) {
    const url = getProviderUrl(providerName, this.token, this.address);

    window.open(url);
  }
}
</script>

<style lang="scss" scoped>
.buy-content {
  padding: 0 $default-padding;
  margin: 10px 0 3px;

  .provider-button {
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
