<template>
  <Row
    :value="value"
    :price="price"
    :icon="icon"
    :iconValue="iconValue"
    :iconAppend="iconAppend"
    :isLoading="isLoading"
    :borderType="borderType"
    :showBorder="showBorder"
    :hideLastBorder="hideLastBorder"
    :color="color"
    :isIconPrepend="isIconPrepend"
    :iconClasses="iconClasses"
  >
    {{ $t(text) }}

    <slot></slot>
  </Row>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Row from './Row.vue';

type BorderType = 'default' | 'secondary';
type Color = 'default' | 'pink-lavender';

@Component({
  components: { Row },
})
export default class InfoRow extends Vue {
  @Prop(String) text!: string;
  @Prop({ default: '' }) value!: string;
  @Prop(String) price!: string;
  @Prop(String) icon?: string;
  @Prop(String) iconValue?: string;
  @Prop(String) color!: Color;
  @Prop(String) iconAppend?: string;
  @Prop({ default: 'secondary' }) borderType!: BorderType;
  @Prop({ default: true }) isIconPrepend!: boolean;
  @Prop({ default: true }) showBorder!: boolean;
  @Prop({ default: true }) hideLastBorder!: boolean;
  @Prop({ default: false }) isLoading!: boolean;
  @Prop({ default: () => [] }) iconClasses!: string[];
}
</script>
