/* eslint-disable vue/prefer-import-from-vue */
declare module 'vue' {
  export * from '@vue/runtime-dom';
  export const ref: typeof import('@vue/reactivity').ref;
  export const computed: typeof import('@vue/reactivity').computed;
  export const watch: typeof import('@vue/runtime-core').watch;
  export const toRef: typeof import('@vue/runtime-core').toRef;
  export const getCurrentInstance: typeof import('@vue/runtime-core').getCurrentInstance;
  export const defineComponent: typeof import('@vue/runtime-core').defineComponent;
  export const nextTick: typeof import('@vue/runtime-core').nextTick;
  export const onBeforeUnmount: typeof import('@vue/runtime-core').onBeforeUnmount;
  export type PropType<T> = import('@vue/runtime-core').PropType<T>;
  export type ComputedRef<T = unknown> = import('@vue/reactivity').ComputedRef<T>;
  export type InjectionKey<T> = import('@vue/runtime-core').InjectionKey<T>;
  export type App = import('@vue/runtime-dom').App;
}
