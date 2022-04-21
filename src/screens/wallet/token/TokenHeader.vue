<template>
  <div class="header">
    <CircleButton iconType="back" backgroundColor="light-black" :handler="back" />

    <div>
      <div class="token-name">
        {{ networkName }}
      </div>
      <div class="token-price">{{ tokenPriceString }}</div>
    </div>

    <CircleButton iconType="more-vertical" backgroundColor="light-black" :handler="openSettings" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';

@Component({
  components: { CircleButton },
})
export default class extends Vue {
  @Prop(String) networkName!: string;
  @Prop(String) tokenName!: string;
  @Prop(String) price!: string;

  get tokenPriceString() {
    return `1 ${this.tokenName.toUpperCase()} = $${this.price}`;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  openSettings() {
    alert('settings');
  }
}
</script>

<style lang="scss" scoped>
.header {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 22px;

  .token-name {
    font-weight: 600;
    font-size: 20px;
    margin-bottom: 4px;
  }

  .token-price {
    color: rgba(255, 255, 255, 0.65);
  }
}
</style>
