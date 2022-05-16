<template>
  <div class="header">
    <CircleButton iconName="chevron-left" backgroundColor="light-black" @click="back" />

    <div>
      <div class="network-name">{{ networkWithFirstCharUp }} network</div>
    </div>

    <CircleButton iconName="dots-vertical" backgroundColor="light-black" @click="openSettings" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { firstCharToUp } from '@/util/stringHelper';
import CircleButton from '@/components/CircleButton.vue';

@Component({
  components: { CircleButton },
})
export default class TokenHeader extends Vue {
  @Prop(String) network!: string;
  @Prop(String) token!: string;

  get networkWithFirstCharUp() {
    return firstCharToUp(this.network);
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

  .network-name {
    font-weight: 600;
    font-size: 20px;
  }
}
</style>
