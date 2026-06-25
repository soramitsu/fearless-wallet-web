import type { Message, MessageBox, Notification } from 'element-plus';

declare module 'vue' {
  export interface GlobalComponents {
    AboveForm: typeof import('@/components/AboveForm.vue').default;
    Alert: typeof import('@/components/Alert.vue').default;
    AssetHighlightIcon: typeof import('@/components/AssetHighlightIcon.vue').default;
    DoubleAssetHighlightIcon: typeof import('@/components/DoubleAssetHighlightIcon.vue').default;
    BadgeButton: typeof import('@/components/BadgeButton.vue').default;
    BorderButton: typeof import('@/components/BorderButton.vue').default;
    Checkbox: typeof import('@/components/Checkbox.vue').default;
    CircleButton: typeof import('@/components/CircleButton.vue').default;
    EllipseButton: typeof import('@/components/EllipseButton.vue').default;
    ComingSoon: typeof import('@/components/ComingSoon.vue').default;
    ConfirmationPopup: typeof import('@/components/ConfirmationPopup.vue').default;
    ContentForm: typeof import('@/components/ContentForm.vue').default;
    DirectionContentForm: typeof import('@/components/DirectionContentForm.vue').default;
    FCorners: typeof import('@/components/FCorners.vue').default;
    Dropdown: typeof import('@/components/Dropdown.vue').default;
    FButton: typeof import('@/components/FButton.vue').default;
    FLink: typeof import('@/components/FLink.vue').default;
    FInput: typeof import('@/components/FInput.vue').default;
    Hint: typeof import('@/components/Hint.vue').default;
    Icon: typeof import('@/components/Icon.vue').default;
    Identicon: typeof import('@/components/Identicon.vue').default;
    InfiniteScroll: typeof import('@/components/InfiniteScroll.vue').default;
    InformationBlock: typeof import('@/components/InformationBlock.vue').default;
    InfoRow: typeof import('@/components/InfoRow.vue').default;
    InputWithIcon: typeof import('@/components/InputWithIcon.vue').default;
    LazyRender: typeof import('@/components/LazyRender.vue').default;
    Loader: typeof import('@/components/Loader.vue').default;
    Loading: typeof import('@/components/Loading.vue').default;
    Logo: typeof import('@/components/Logo.vue').default;
    ExternalLogo: typeof import('@/components/ExternalLogo.vue').default;
    ExternalWidget: typeof import('@/components/ExternalWidget.vue').default;
    NotificationPopup: typeof import('@/components/NotificationPopup.vue').default;
    Popup: typeof import('@/components/Popup.vue').default;
    ProgressBar: typeof import('@/components/ProgressBar.vue').default;
    QR: typeof import('@/components/QR.vue').default;
    Rotate: typeof import('@/components/Rotate.vue').default;
    Scroll: typeof import('@/components/Scroll.vue').default;
    SearchInput: typeof import('@/components/SearchInput.vue').default;
    FSelect: typeof import('@/components/FSelect.vue').default;
    SelectPopup: typeof import('@/components/SelectPopup.vue').default;
    Shimmer: typeof import('@/components/Shimmer.vue').default;
    SelectInput: typeof import('@/components/SelectInput.vue').default;
    Slider: typeof import('@/components/Slider.vue').default;
    Switcher: typeof import('@/components/Switcher.vue').default;
    TabButton: typeof import('@/components/TabButton.vue').default;
    Tooltip: typeof import('@/components/Tooltip.vue').default;
    ValidatedInput: typeof import('@/components/ValidatedInput.vue').default;
    Tabs: typeof import('@/components/Tabs.vue').default;
  }

  export interface ComponentCustomProperties {
    $prompt: typeof MessageBox.prompt;
    $alert: typeof MessageBox.alert;
    $message: typeof Message;
    $notify: typeof Notification;
    $tc: (key: string, choice?: number, values?: Record<string, unknown>) => string;
  }
}

export {};
