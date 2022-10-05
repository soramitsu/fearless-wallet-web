<template>
  <Corners :isError="true" size="big">
    <div class="alert-container">
      <div class="alert__content">
        <Hint class="alert__header" size="big" iconName="warning-orange" text="Attention" />

        <p class="alert__message">
          <slot>{{ message }}</slot>
        </p>
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';
import Hint from '@/components/Hint.vue';

@Component({
  components: {
    Corners,
    Hint,
  },
})
export default class Container extends Vue {
  @Prop(String) message!: string;
}
</script>

<style lang="scss" scoped>
.alert-container {
  background: rgba(255, 255, 255, 0.05);
  padding: $default-padding;
  border: 1px solid $error-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
}

.alert__content {
  width: 100%;
}

.alert__header {
  margin-bottom: 6px;
  font-size: $default-padding !important;
  line-height: 150%;
  color: $default-white !important;
}

.alert__message {
  font-weight: 400;
  line-height: 150%;
  color: $default-white;
  text-align: flex-start;
}
</style>
