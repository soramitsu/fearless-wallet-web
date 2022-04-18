<template>
  <div :class="menuItemClasses">
    <s-icon :name="icon" />
    <div class="name">
      {{ name }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type MenuValue = 'Wallet' | 'Crowdloans' | 'Stacking' | 'DEX' | 'History';

@Component({
  components: {},
})
export default class extends Vue {
  @Prop(String) name!: MenuValue;
  @Prop({ default: false }) isActive!: boolean;

  get menuItemClasses() {
    return ['menu-item', { active: this.isActive }];
  }

  get icon() {
    switch (this.name) {
      case 'Wallet':
        return 'finance-wallet-24';
      case 'Crowdloans':
        return 'various-rocket-24';
      case 'Stacking':
        return 'software-database-24';
      case 'DEX':
        return 'grid-segment-24';
      case 'History':
        return 'time-time-history-24';
      default:
        return '';
    }
  }
}
</script>

<style lang="scss" scoped>
.menu-item {
  display: flex;
  flex-direction: column;
  color: rgba(255, 255, 255, 0.5);

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
}

.active {
  color: #fff;

  i {
    color: #fff;
  }
}
</style>
