<template>
  <div class="staking">
    <ComingSoon name="Staking" />
  </div>
</template>

<script lang="ts">
import ComingSoon from '@/components/ComingSoon.vue';
import { Component, Vue } from 'vue-property-decorator';

@Component({ components: { ComingSoon } })
export default class Staking extends Vue {}
</script>

<style lang="scss" scoped>
.staking {
  height: 100%;
}
</style>
