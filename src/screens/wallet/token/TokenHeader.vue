<template>
  <div class="header">
    <CircleButton iconType="back" backgroundColor="light-black" :handler="back" />

    <div>
      <div class="network-name">{{ networkWithFirstCharUp }} network</div>
    </div>

    <CircleButton iconType="more-vertical" backgroundColor="light-black" :handler="openSettings" />
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
export default class extends Vue {
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
