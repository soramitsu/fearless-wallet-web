<template>
  <Row :text="text" :value="value" :price="price" :icon="icon">
    {{ $t(text) }}

    <Icon v-if="icon" :icon="icon" class="icon-info" :class="classes" />
  </Row>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Row from './Row.vue';
@Component({
  components: {
    Row,
  },
})
export default class InfoRow extends Vue {
  @Prop(String) text!: string;
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon?: string;
  @Prop({ default: false }) isIconPrepend!: boolean;
  @Prop({ default: () => [] }) iconClasses!: string[];

  get classes() {
    return ['icon-info', ...this.iconClasses];
  }
}
</script>
