<template>
  <div class="wrapper" @click="click">
    <FInput
      :value="value"
      size="big"
      class="rotate-input"
      :placeholder="placeholder"
      :readonly="true"
      :cursorPointer="true"
      @change="changeValue"
    />

    <Rotate v-if="icon === 'rotate'" :isActive="isActiveRotate" class="icon">
      <Icon icon="down" data-testid="rotate" />
    </Rotate>

    <div v-else-if="isCloseIcon" class="icon" @click="clickIcon">
      <Icon icon="close" class="close-icon" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type IconType = 'rotate' | 'close';

interface Props {
  value: string | number;
  placeholder: string;
  isActiveRotate?: boolean;
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

const changeValue = (newValue: string | number) => {
  emit('change', newValue);
};

const click = () => {
  if (props.icon === 'rotate') emit('click');
};

const clickIcon = () => {
  emit('click');
};
</script>

<style lang="scss" scoped>
.fw-web {
  .wrapper {
    .rotate-input {
      flex: 0 0 95dvw;
      width: 95dvw;
    }
  }
}

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
