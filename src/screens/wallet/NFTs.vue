<template>
  <div class="nfts">
    <ComingSoon name="NFTs" />
  </div>
</template>

<script lang="ts">
import ComingSoon from '@/components/ComingSoon.vue';
import { Component, Vue } from 'vue-property-decorator';

@Component({ components: { ComingSoon } })
export default class NFTs extends Vue {}
</script>

<style lang="scss" scoped>
.nfts {
}
</style>
