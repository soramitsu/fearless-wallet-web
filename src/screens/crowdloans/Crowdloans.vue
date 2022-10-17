<template>
  <div class="crowdloans">
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
    return MenuItems.crowdloans;
  }
}
</script>

<style lang="scss" scoped>
.crowdloans {
}
</style>
