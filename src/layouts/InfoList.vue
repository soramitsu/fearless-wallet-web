<template>
  <Corners size="big">
    <div class="info">
      <dl class="info__list">
        <slot></slot>
      </dl>
    </div>
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
export default class InfoList extends Vue {}
</script>

<style lang="scss" scoped>
.info {
  position: relative;
  display: flex;
  flex-flow: column;
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border: 1px solid $default-background-color !important;
  border-radius: $default-border-radius;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  width: 100%;
  margin-bottom: 14px;
}

.info__list {
  display: grid;
  grid-template-columns: 100px 1fr;
  place-items: start;
  gap: 8px;
}
</style>
