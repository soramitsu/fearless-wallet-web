<template>
  <div class="accounts-item">
    <div class="left-part">
      <div class="img-container">
        <NetworkLogo :name="network" />
      </div>
      <div class="description">
        <div class="network-name">{{ getUpperValue(network) }}</div>
        <div class="asset-name">{{ getUpperValue(asset) }}</div>
        <div class="address">{{ address }}</div>
      </div>
    </div>

    <CircleButton
      v-if="showSettingsIcon"
      :ref="circleButtonRef"
      iconName="dots-horizontal"
      backgroundColor="light-black"
      @click="openAccountSettingsPopup(network)"
    />

    <img v-else src="@/assets/circle-plus-pink.svg" class="plus-icon" @click="$emit('openSourceTypePopup')" />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import CircleButton from '@/components/CircleButton.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';

@Component({
  components: { CircleButton, NetworkLogo },
})
export default class AccountsItem extends Vue {
  readonly circleButtonRef = 'circleButton';

  @Prop(String) network!: string;
  @Prop(String) asset!: string;
  @Prop(String) address!: string;

  get showSettingsIcon() {
    return this.address !== '';
  }

  getUpperValue(string: string) {
    return string.toUpperCase();
  }

  openAccountSettingsPopup(name: string) {
    const buttonTop = (this.$refs[this.circleButtonRef] as Vue).$el.getBoundingClientRect().top;

    this.$emit('openAccountSettingsPopup', name, buttonTop);
  }
}
</script>

<style lang="scss" scoped>
.accounts-item {
  display: flex;
  padding: 8px 0 8px 0px;
  border-bottom: 1px solid $default-background-color;
  justify-content: space-between;
  align-items: center;
  height: 78px;

  &:last-child {
    border-bottom: none;
  }

  .plus-icon {
    height: 32px;
    filter: invert(0.05);

    &:hover {
      cursor: pointer;
      filter: invert(0);
    }
  }

  .left-part {
    display: flex;
  }

  .img-container {
    width: 60px;
    margin: auto 0;
  }

  .description {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 395px;

    .network-name {
      font-size: 12px;
      font-weight: 700;
      color: $gray-color;
      height: 16px;
    }

    .asset-name {
      font-weight: 700;
      color: rgba(255, 255, 255, 1);
      font-size: 20px;
      height: 30px;
      line-height: 30px;
    }

    .address {
      color: rgba(255, 255, 255, 1);
      font-size: 13px;
      width: 100%;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}
</style>
