// Upgrade E2E stub (tests/upgrade/legacy-builds.json, build 1.3.1): every component the 1.3.1 popup registers is an
// empty Vue plugin. Only the service worker of that build is used.
const plugin = () => ({ install() {} });
const names = ['SButton', 'SCard', 'SCheckbox', 'SDialog', 'SPagination', 'SScrollbar', 'SSlider', 'SSwitch', 'STooltip', 'SCol', 'SCollapse', 'SCollapseItem', 'SDesignSystemProvider', 'SDivider', 'SDropdown', 'SDropdownItem', 'SFloatInput', 'SForm', 'SFormItem', 'SIcon', 'SImage', 'SInput', 'SJsonInput', 'SMenu', 'SMenuItem', 'SMenuItemGroup', 'SRadio', 'SRadioGroup', 'SRow', 'SSelect', 'SOption', 'SSkeleton', 'SSkeletonItem', 'STab', 'STabs', 'STable', 'STableColumn'];
for (const name of names) module.exports[name] = plugin();
module.exports.default = { install() {} };
