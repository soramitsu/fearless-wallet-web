import type { App } from 'vue';
import AboveForm from '@/components/AboveForm.vue';
import Alert from '@/components/Alert.vue';
import AssetHighlightIcon from '@/components/AssetHighlightIcon.vue';
import DoubleAssetHighlightIcon from '@/components/DoubleAssetHighlightIcon.vue';
import BadgeButton from '@/components/BadgeButton.vue';
import BorderButton from '@/components/BorderButton.vue';
import Checkbox from '@/components/Checkbox.vue';
import CircleButton from '@/components/CircleButton.vue';
import EllipseButton from '@/components/EllipseButton.vue';
import ComingSoon from '@/components/ComingSoon.vue';
import ConfirmationPopup from '@/components/ConfirmationPopup.vue';
import ContentForm from '@/components/ContentForm.vue';
import DirectionContentForm from '@/components/DirectionContentForm.vue';
import FCorners from '@/components/FCorners.vue';
import Dropdown from '@/components/Dropdown.vue';
import ExternalLogo from '@/components/ExternalLogo.vue';
import ExternalWidget from '@/components/ExternalWidget.vue';
import FButton from '@/components/FButton.vue';
import FInput from '@/components/FInput.vue';
import Hint from '@/components/Hint.vue';
import Icon from '@/components/Icon.vue';
import Identicon from '@/components/Identicon.vue';
import InfiniteScroll from '@/components/InfiniteScroll.vue';
import InformationBlock from '@/components/InformationBlock.vue';
import InfoRow from '@/components/InfoRow.vue';
import InputWithIcon from '@/components/InputWithIcon.vue';
import LazyRender from '@/components/LazyRender.vue';
import FLink from '@/components/FLink.vue';
import Loader from '@/components/Loader.vue';
import Loading from '@/components/Loading.vue';
import Logo from '@/components/Logo.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import Popup from '@/components/Popup.vue';
import ProgressBar from '@/components/ProgressBar.vue';
import QR from '@/components/QR.vue';
import Rotate from '@/components/Rotate.vue';
import Scroll from '@/components/Scroll.vue';
import SearchInput from '@/components/SearchInput.vue';
import FSelect from '@/components/FSelect.vue';
import SelectPopup from '@/components/SelectPopup.vue';
import Shimmer from '@/components/Shimmer.vue';
import SelectInput from '@/components/SelectInput.vue';
import Slider from '@/components/Slider.vue';
import Switcher from '@/components/Switcher.vue';
import TabButton from '@/components/TabButton.vue';
import Tooltip from '@/components/Tooltip.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import Tabs from '@/components/Tabs.vue';

const components = [
  ['AboveForm', AboveForm],
  ['Alert', Alert],
  ['AssetHighlightIcon', AssetHighlightIcon],
  ['DoubleAssetHighlightIcon', DoubleAssetHighlightIcon],
  ['BadgeButton', BadgeButton],
  ['BorderButton', BorderButton],
  ['Checkbox', Checkbox],
  ['CircleButton', CircleButton],
  ['EllipseButton', EllipseButton],
  ['ComingSoon', ComingSoon],
  ['ConfirmationPopup', ConfirmationPopup],
  ['ContentForm', ContentForm],
  ['DirectionContentForm', DirectionContentForm],
  ['FCorners', FCorners],
  ['Dropdown', Dropdown],
  ['FButton', FButton],
  ['FLink', FLink],
  ['FInput', FInput],
  ['Hint', Hint],
  ['Icon', Icon],
  ['Identicon', Identicon],
  ['InfiniteScroll', InfiniteScroll],
  ['InformationBlock', InformationBlock],
  ['InfoRow', InfoRow],
  ['InputWithIcon', InputWithIcon],
  ['LazyRender', LazyRender],
  ['Loader', Loader],
  ['Loading', Loading],
  ['Logo', Logo],
  ['ExternalLogo', ExternalLogo],
  ['ExternalWidget', ExternalWidget],
  ['NotificationPopup', NotificationPopup],
  ['Popup', Popup],
  ['ProgressBar', ProgressBar],
  ['QR', QR],
  ['Rotate', Rotate],
  ['Scroll', Scroll],
  ['SearchInput', SearchInput],
  ['FSelect', FSelect],
  ['SelectPopup', SelectPopup],
  ['Shimmer', Shimmer],
  ['SelectInput', SelectInput],
  ['Slider', Slider],
  ['Switcher', Switcher],
  ['TabButton', TabButton],
  ['Tooltip', Tooltip],
  ['ValidatedInput', ValidatedInput],
  ['Tabs', Tabs],
] as const;

//add component to component.d.ts as well
export const registerGlobalComponents = (app: App) => {
  components.forEach(([name, component]) => {
    app.component(name, component);
  });
};

export default registerGlobalComponents;
