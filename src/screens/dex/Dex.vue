<template>
  <div class="dex">
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
export default class Dex extends Vue {
  get name() {
    return MenuItems.dex;
  }
}
</script>

<style lang="scss" scoped>
.dex {
  height: 100%;
}
</style>
