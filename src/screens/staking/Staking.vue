<template>
  <div class="staking">
    <ComingSoon :name="name" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { MenuItems } from '@/interfaces/common';

@Component
export default class Staking extends Vue {
  get name() {
    return MenuItems.staking;
  }
}
</script>
