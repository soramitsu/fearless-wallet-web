<template>
  <Corners size="big">
    <dl class="transaction-list">
      <slot>fdfdfdfd</slot>
    </dl>
  </Corners>
</template>

<script>
import { Vue, Component } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';
@Component({
  components: {
    Corners,
  },
})
export default class Container extends Vue {}
</script>

<style lang="scss" scoped>
.transaction-list {
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  display: grid;
  font-size: 16px;

  grid-template-columns: 120px 1fr;
  grid-gap: 5px;
}
</style>
