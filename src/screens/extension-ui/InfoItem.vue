<template>
  <Fragment>
    <dt class="name">{{ name }}</dt>
    <dd class="value">{{ value }}</dd>
  </Fragment>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Fragment } from 'vue-fragment';

@Component({
  components: {
    Fragment,
  },
})
export default class InfoItem extends Vue {
  @Prop(String) name!: string;
  @Prop([String, Number]) value!: string | number;
}
</script>

<style lang="scss" scoped>
.name {
  color: $gray-color;
  font-weight: 700;
  font-size: 12px;
  line-height: 20px;
  text-transform: uppercase;
}

.value {
  max-width: 370px;
  overflow: hidden;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
