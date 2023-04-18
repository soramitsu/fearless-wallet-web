<template>
  <div class="crowdloans">
    <ComingSoon :name="name" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { MenuItems } from '@/interfaces/common';

@Component
export default class Crowdloans extends Vue {
  get name() {
    return MenuItems.crowdloans;
  }
}
</script>
