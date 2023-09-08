import type { MyValidator } from '@/interfaces';

export const myValidators: MyValidator[] = [
  {
    name: 'Agustín trabajo',
    address: '5E2ku91ffpVpz78WNwP18ZxR2ComiB9KLQqWnEd6UCS2f3m3',
    description: 'test',
    rewards: '1.1',
    isRecommended: true,
    isSlashed: false,
    isOversubscribed: true,
    limitValidatorsIdentity: true,
    onchainIdentity: true,
    apy: 12.8,
  },
  {
    name: 'Agustín Contadora',
    address: '5EAJh2UwK4u1RiZTH2zc5yRtcyUvkcpBakj6UDJHCT9rnoK8',
    description: 'test',
    rewards: '2.16',
    isRecommended: true,
    isSlashed: false,
    isOversubscribed: true,
    limitValidatorsIdentity: true,
    onchainIdentity: false,
    apy: 15.1,
  },
];
