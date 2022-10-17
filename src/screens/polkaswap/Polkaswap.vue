<template>
  <div class="polkaswap">
    <ComingSoon :name="name" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ComingSoon from '@/components/ComingSoon.vue';
import { MenuItems } from '@/interfaces/common';

@Component({
  components: { ComingSoon },
})
export default class Polkaswap extends Vue {
  get name() {
    return MenuItems.polkaswap;
  }
}
</script>

<style lang="scss" scoped>
.polkaswap {
}
</style>
