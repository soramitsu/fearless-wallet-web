<template>
  <div class="staking">
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
export default class Crowdloans extends Vue {
  get name() {
    return MenuItems.staking;
  }
}
</script>

<style lang="scss" scoped>
.staking {
}
</style>
