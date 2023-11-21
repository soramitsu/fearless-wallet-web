declare type Nullable<T> = T | null | undefined;

type Megabit = number;
type Millisecond = number;
type EffectiveConnectionType = '2g' | '3g' | '4g' | 'slow-2g';
type ConnectionType = 'bluetooth' | 'cellular' | 'ethernet' | 'mixed' | 'none' | 'other' | 'unknown' | 'wifi' | 'wimax';

interface NetworkInformation extends EventTarget {
  readonly type?: ConnectionType;
  readonly effectiveType?: EffectiveConnectionType;
  readonly downlinkMax?: Megabit;
  readonly downlink?: Megabit;
  readonly rtt?: Millisecond;
  readonly saveData?: boolean;
  onchange?: EventListener;
}

declare interface NavigatorNetworkInformation {
  readonly connection: NetworkInformation;
}

type Navigator = NavigatorNetworkInformation;
type WorkerNavigator = NavigatorNetworkInformation;

declare module 'vue-virtual-draglist' {
  import { type VueConstructor } from 'vue';
  import type Vue from 'vue';

  type CombinedVueInstance<Instance extends Vue, Data, Methods, Computed, Props> = Data &
    Methods &
    Computed &
    Props &
    Instance;

  type ExtendedVue<Instance extends Vue, Data, Methods, Computed, Props> = VueConstructor<
    CombinedVueInstance<Instance, Data, Methods, Computed, Props> & Vue
  >;

  export type DraggedContext<T> = {
    index: number;
    futureIndex: number;
    element: T;
  };

  export type DropContext<T> = {
    index: number;
    component: Vue;
    element: T;
  };

  export type Rectangle = {
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  };

  export type MoveEvent<T> = {
    originalEvent: DragEvent;
    dragged: Element;
    draggedContext: DraggedContext<T>;
    draggedRect: Rectangle;
    related: Element;
    relatedContext: DropContext<T>;
    relatedRect: Rectangle;
    from: Element;
    to: Element;
    willInsertAfter: boolean;
    isTrusted: boolean;
  };

  const draggable: ExtendedVue<Vue, object, object, object, object>;

  export default draggable;
}
