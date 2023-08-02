<template>
  <Row :value="value" :price="price" :icon="icon" rowClasses="asset-row" @click="onSelect">
    <ExternalLogo v-if="icon" :name="icon" :width="24" class="icon-info" :class="classes" />
    {{ text }}
  </Row>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Row from '@/components/Row.vue';
@Component({
  components: {
    Row,
  },
})
export default class AssetRow extends Vue {
  @Prop(String) text!: string;
  @Prop(String) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon?: string;

  get classes() {
    return ['icon-info'];
  }

  onSelect() {
    this.$emit('selectHistory');
  }
}
</script>
