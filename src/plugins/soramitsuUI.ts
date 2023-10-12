import Vue from 'vue';
import DesignSystem from '@soramitsu-ui/ui-vue2/lib/types/DesignSystem';
import { setDesignSystem, setTheme } from '@soramitsu-ui/ui-vue2/lib/utils';
import {
  SButton,
  SCard,
  SCheckbox,
  SDialog,
  SPagination,
  SScrollbar,
  SSlider,
  SSwitch,
  STooltip,
  SCol,
  SCollapse,
  SCollapseItem,
  SDesignSystemProvider,
  SDivider,
  SDropdown,
  SDropdownItem,
  SFloatInput,
  SForm,
  SFormItem,
  SIcon,
  SImage,
  SInput,
  SJsonInput,
  SMenu,
  SMenuItem,
  SMenuItemGroup,
  SRadio,
  SRadioGroup,
  SRow,
  SSelect,
  SOption,
  SSkeleton,
  SSkeletonItem,
  STab,
  STabs,
  STable,
  STableColumn,
} from '@soramitsu-ui/ui-vue2';
import ElementUIPlugin, { Message, MessageBox, Notification } from '@soramitsu-ui/ui-vue2/lib/plugins/elementUI';

import SoramitsuUIStorePlugin from '@soramitsu-ui/ui-vue2/lib/plugins/soramitsuUIStore';

import store from '@/store';

type SNotificationParams = {
  message: string;
  title: string;
  type: string;
};

// TODO: [arch] CHECK IT LATER
const notificationFn = ({ message, title, type }: SNotificationParams) => {
  Notification({
    message,
    title,
    duration: 2500, // If is will be changed you should change animation duration as well
    type,
    customClass: 'sora s-flex fearless-notify',
  });
};

Vue.use(ElementUIPlugin)
  .use(SoramitsuUIStorePlugin, { store })
  .use(SButton)
  .use(SCard)
  .use(SCheckbox)
  .use(SCol)
  .use(SCollapse)
  .use(SCollapseItem)
  .use(SDesignSystemProvider)
  .use(SDialog)
  .use(SDivider)
  .use(SDropdown)
  .use(SDropdownItem)
  .use(SFloatInput)
  .use(SForm)
  .use(SFormItem)
  .use(SIcon)
  .use(SImage)
  .use(SInput)
  .use(SJsonInput)
  .use(SMenu)
  .use(SMenuItem)
  .use(SMenuItemGroup)
  .use(SPagination)
  .use(SRadio)
  .use(SRadioGroup)
  .use(SRow)
  .use(SScrollbar)
  .use(SSelect)
  .use(SOption)
  .use(SSkeleton)
  .use(SSkeletonItem)
  .use(SSlider)
  .use(SSwitch)
  .use(STab)
  .use(STabs)
  .use(STable)
  .use(STableColumn)
  .use(STooltip);

Vue.prototype.$prompt = MessageBox.prompt;
Vue.prototype.$alert = MessageBox.alert;
Vue.prototype.$message = Message;
Vue.prototype.$notify = notificationFn;

setTheme();
setDesignSystem(DesignSystem.NEUMORPHIC);
