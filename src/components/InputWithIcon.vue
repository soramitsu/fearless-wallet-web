<template>
  <div class="wrapper" @click="click">
    <FInput
      v-model="vModel"
      size="big"
      class="rotate-input"
      :placeholder="placeholder"
      :readonly="true"
      :cursorPointer="true"
    />

    <Rotate v-if="icon === 'rotate'" :isActive="isActiveRotate" class="icon">
      <SIcon name="chevron-bottom-16" data-testid="rotate" />
    </Rotate>

    <div v-else-if="isCloseIcon" class="icon" @click="clickIcon">
      <Icon icon="close" class="close-icon" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { withDefaults, computed } from 'vue';

type IconType = 'rotate' | 'close';

interface Props {
  value: string | number;
  placeholder: string;
  isActiveRotate: boolean;
  icon: IconType;
}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  placeholder: '',
  isActiveRotate: false,
  icon: 'rotate',
});

const emit = defineEmits(['click', 'change']);

const isCloseIcon = computed(() => props.icon === 'close' && props.value !== '');

const vModel = computed({
  get: () => props.value,
  set: (value: string | number) => emit('change', value),
});

const click = () => {
  if (props.icon === 'rotate') emit('click');
};

const clickIcon = () => {
  emit('click');
};
</script>

<style lang="scss" scoped>
.wrapper {
  display: flex;
  justify-content: space-between;

  .rotate-input {
    flex: 0 0 529px;
    width: 529px;

    & .el-input__inner::first-letter {
      text-transform: capitalize;
    }
  }

  .icon {
    position: relative;
    right: 40px;
    top: 23px;
    height: 15px;

    &:hover {
      cursor: pointer;
    }

    .s-icon-chevron-bottom-16 {
      color: $gray-color;
    }

    .close-icon {
      height: 15px;
      width: 15px;
      color: $gray-color;
    }
  }
}
</style>
