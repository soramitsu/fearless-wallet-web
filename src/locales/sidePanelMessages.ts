// Like walletUpgradeMessages.ts, these stay outside translation.json until reviewed Akkadian and Egyptian translations
// exist: those locales read the English text through the fallback. Registered at locale initialization, because the
// settings menu that offers the switch is on every wallet screen.
const en = {
  sidePanel: {
    switchToPopup: 'Switch to popup',
    switchToPopupDescription: 'The toolbar button opens a small window instead of the side panel',
    switchToSidePanel: 'Switch to side panel',
    switchToSidePanelDescription: 'The toolbar button opens Fearless beside the page, at full height',
    unavailable: 'This browser cannot show Fearless in a side panel.',
  },
};

const ru: typeof en = {
  sidePanel: {
    switchToPopup: 'Открывать во всплывающем окне',
    switchToPopupDescription: 'Кнопка на панели инструментов откроет небольшое окно вместо боковой панели',
    switchToSidePanel: 'Открывать в боковой панели',
    switchToSidePanelDescription: 'Кнопка на панели инструментов откроет Fearless рядом со страницей, во всю высоту окна',
    unavailable: 'Этот браузер не может показать Fearless в боковой панели.',
  },
};

export const sidePanelMessages = { 'en-EN': en, 'ru-RU': ru } as const;
