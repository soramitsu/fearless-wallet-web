<template>
  <div class="accounts-item" data-testid="accountItem">
    <div class="left-part">
      <div class="img-container">
        <ExternalLogo :name="icon" class="img" />
      </div>
      <div class="description">
        <div class="network-name" data-testid="networkName">{{ getUpperValue(network) }}</div>
        <div v-if="addressExist" class="address" data-testid="networkAddress">{{ address }}</div>
      </div>
    </div>

    <CircleButton
      v-if="addressExist"
      :ref="circleButtonRef"
      iconName="dots-horizontal"
      backgroundColor="light-black"
      data-testid="dots"
      @click="openAccountSettingsPopup(network)"
    />

    <Icon
      v-else-if="!isMobile"
      icon="circle-plus"
      :className="['plus-icon']"
      @click="$emit('openAddEthereumAccountPopup')"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class AccountsItem extends Vue {
  readonly circleButtonRef = 'circleButton';
  @Prop(String) icon!: string;
  @Prop(String) network!: string;
  @Prop(Boolean) isMobile!: boolean;
  @Prop(String) address!: string;

  get addressExist() {
    return !!this.address;
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
  border-bottom: $default-border;
  justify-content: space-between;
  align-items: center;
  height: 78px;

  &:last-child {
    border-bottom: none;
  }

  .plus-icon {
    height: 32px;
    width: 32px;
    opacity: 1;
    color: $pink-color;

    &:hover {
      cursor: pointer;
      opacity: 0.95;
    }
  }

  .left-part {
    display: flex;
  }

  .img-container {
    width: 60px;
    margin: auto 0;
    .img {
      width: 32px;
    }
  }

  .description {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    width: 395px;

    .network-name {
      font-size: 0.75rem;
      font-weight: 700;
      color: $gray-color;
      height: 16px;
    }

    .asset-name {
      font-weight: 700;
      color: rgba(255, 255, 255, 1);
      font-size: 1.25rem;
      height: 30px;
      line-height: 30px;
    }

    .address {
      color: rgba(255, 255, 255, 1);
      font-size: 0.8125em;
      margin-top: 10px;
      width: 100%;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}
</style>
