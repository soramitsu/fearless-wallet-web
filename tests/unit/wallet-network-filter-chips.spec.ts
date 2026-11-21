import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import NetworkFilterChips from '@/screens/wallet&asset/wallet/NetworkFilterChips.vue';

const options = [
  { name: 'Ethereum', icon: 'ethereum-logo' },
  { name: 'Polkadot', icon: 'polkadot-logo' },
  { name: 'Kusama', icon: 'kusama-logo' },
];
const labels = { group: 'Show assets on', all: 'All networks', more: 'More networks' };

const wrappers: VueWrapper[] = [];
const mountChips = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(NetworkFilterChips, {
    attachTo: document.body,
    props: { options, labels, selected: 'all', ...props },
    global: { stubs: { ExternalLogo: { props: ['name'], template: '<i class="logo" :data-name="name" />' } } },
  });
  wrappers.push(wrapper);
  return wrapper;
};

/** Gives the row a scroll box: happy-dom lays nothing out. */
function sizeRow(row: HTMLElement, { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(row, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(row, 'clientWidth', { configurable: true, value: clientWidth });
}

const wheel = (deltaY: number, deltaX = 0) => new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true });

describe('the network chips above the wallet list', () => {
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

  it('offers All, then each network in the order given, named for assistive technology', () => {
    const wrapper = mountChips();

    expect(wrapper.get('[data-testid="networkFilter"]').attributes('role')).toBe('group');
    expect(wrapper.get('[data-testid="networkFilter"]').attributes('aria-label')).toBe('Show assets on');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['All networks', 'Ethereum', 'Polkadot', 'Kusama']);
    expect(wrapper.findAll('.logo').map((logo) => logo.attributes('data-name'))).toEqual(['ethereum-logo', 'polkadot-logo', 'kusama-logo']);
    expect(wrapper.get('[data-testid="networkFilterAll"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="networkFilterMore"]').exists()).toBe(false);
  });

  it('picks a network, and All again when the same chip is picked twice', async () => {
    const wrapper = mountChips();

    await wrapper.get('[data-network="Polkadot"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['Polkadot']]);

    await wrapper.setProps({ selected: 'polkadot' });
    expect(wrapper.get('[data-network="Polkadot"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="networkFilterAll"]').attributes('aria-pressed')).toBe('false');

    await wrapper.get('[data-network="Polkadot"]').trigger('click');
    await wrapper.get('[data-testid="networkFilterAll"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['Polkadot'], ['all'], ['all']]);
  });

  it('keeps a chosen group on a pressed chip that opens the full list, as More networks does', async () => {
    const wrapper = mountChips({ selected: 'popular', groupLabel: 'Popular', showMore: true });

    expect(wrapper.get('[data-testid="networkFilterGroup"]').text()).toBe('Popular');
    expect(wrapper.get('[data-testid="networkFilterGroup"]').attributes('aria-pressed')).toBe('true');

    await wrapper.get('[data-testid="networkFilterGroup"]').trigger('click');
    await wrapper.get('[data-testid="networkFilterMore"]').trigger('click');
    expect(wrapper.emitted('more')).toHaveLength(2);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('turns a mouse wheel into sideways scrolling while the row can move, and lets the page have it at the ends', () => {
    const wrapper = mountChips();
    const row = wrapper.get('[data-testid="networkFilter"]').element as HTMLElement;
    sizeRow(row, { scrollWidth: 600, clientWidth: 300 });

    const down = wheel(120);
    row.dispatchEvent(down);
    expect(row.scrollLeft).toBe(120);
    expect(down.defaultPrevented).toBe(true);

    row.scrollLeft = 300;
    const pastTheEnd = wheel(120);
    row.dispatchEvent(pastTheEnd);
    expect(row.scrollLeft).toBe(300);
    expect(pastTheEnd.defaultPrevented).toBe(false);

    // A trackpad's own sideways swipe is left alone.
    const sideways = wheel(10, 80);
    row.dispatchEvent(sideways);
    expect(sideways.defaultPrevented).toBe(false);
  });

  it('leaves the wheel to the page when every chip already fits', () => {
    const wrapper = mountChips();
    const row = wrapper.get('[data-testid="networkFilter"]').element as HTMLElement;
    sizeRow(row, { scrollWidth: 300, clientWidth: 300 });

    const down = wheel(120);
    row.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(row.scrollLeft).toBe(0);
  });

  it('fades the edge where more chips wait, on either side', async () => {
    const wrapper = mountChips();
    const filter = wrapper.get('[data-testid="networkFilter"]');
    const row = filter.element as HTMLElement;
    sizeRow(row, { scrollWidth: 600, clientWidth: 300 });
    const scrollTo = async (left: number) => {
      row.scrollLeft = left;
      row.dispatchEvent(new Event('scroll'));
      await nextTick();
    };

    await scrollTo(0);
    expect(filter.classes()).toEqual(expect.arrayContaining(['network-filter--more-after']));
    expect(filter.classes()).not.toContain('network-filter--more-before');

    await scrollTo(150);
    expect(filter.classes()).toEqual(expect.arrayContaining(['network-filter--more-before', 'network-filter--more-after']));

    await scrollTo(300);
    expect(filter.classes()).toContain('network-filter--more-before');
    expect(filter.classes()).not.toContain('network-filter--more-after');
  });

  it('scrolls a chip picked out of sight into the row, never moving the page', async () => {
    const wrapper = mountChips();
    const row = wrapper.get('[data-testid="networkFilter"]').element as HTMLElement;
    sizeRow(row, { scrollWidth: 600, clientWidth: 200 });
    const kusama = wrapper.get('[data-network="Kusama"]').element as HTMLElement;
    Object.defineProperty(kusama, 'offsetLeft', { configurable: true, value: 400 });
    Object.defineProperty(kusama, 'offsetWidth', { configurable: true, value: 90 });
    const scrollIntoView = vi.fn();
    Object.defineProperty(kusama, 'scrollIntoView', { configurable: true, value: scrollIntoView });

    await wrapper.setProps({ selected: 'Kusama' });
    await nextTick();

    expect(row.scrollLeft).toBe(400 + 90 - 200 + 8);
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Back to a chip before the visible part: the row scrolls back to it.
    const ethereum = wrapper.get('[data-network="Ethereum"]').element as HTMLElement;
    Object.defineProperty(ethereum, 'offsetLeft', { configurable: true, value: 60 });
    Object.defineProperty(ethereum, 'offsetWidth', { configurable: true, value: 90 });
    await wrapper.setProps({ selected: 'Ethereum' });
    await nextTick();

    expect(row.scrollLeft).toBe(52);
  });
});
