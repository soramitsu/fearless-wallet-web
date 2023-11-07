<template>
  <div class="link" @click="$emit('click')">
    {{ $t(props.text) }}
  </div>
</template>

<script lang="ts" setup>
type Props = {
  text: string;
};

const props = withDefaults(defineProps<Props>(), {
  text: '',
});
</script>

<style lang="scss" scoped>
.link {
  color: $pink-lavender-color;
  text-decoration: underline;
  text-align: left;
  cursor: pointer;
}
</style>
