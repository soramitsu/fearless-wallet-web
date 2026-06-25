import { type VNode } from 'vue';

declare global {
  namespace JSX {
    type Element = VNode;
    // tslint:disable no-empty-interface
    interface ElementClass {
      $props: Record<string, unknown>;
    }
    interface IntrinsicElements {
      [elem: string]: unknown;
    }
  }
}
