<template>
  <div :class="menuItemClasses">
    <img :src="img" class="menu-icon" />

    <div class="name">
      {{ name }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type MenuValue = 'Wallet' | 'Crowdloans' | 'Staking' | 'DEX' | 'History';

@Component({
  components: {},
})
export default class MenuItem extends Vue {
  @Prop(String) name!: MenuValue;
  @Prop({ default: false }) isActive!: boolean;

  get menuItemClasses() {
    return ['menu-item', { active: this.isActive }];
  }

  get img() {
    const fileName = this.name === 'DEX' ? 'polkaswap' : this.name.toLowerCase();

    return require(`@/assets/${fileName}.svg`);
  }
}
</script>

<style lang="scss" scoped>
.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(255, 255, 255, 0.5);
  width: 85px;

  &:hover {
    cursor: pointer;
    color: #fff;
    transition: 300ms ease-out;

    i {
      color: #fff;
      transition: 300ms ease-out;
    }
  }

  .name {
    margin-top: 8px;
    font-weight: 600;
    font-size: 13px;
  }

  i {
    color: rgba(255, 255, 255, 0.5);
  }

  .menu-icon {
    height: 24px;
    width: 24px;
  }
}

.active {
  color: #fff;

  i {
    color: #fff;
  }
}
</style>
