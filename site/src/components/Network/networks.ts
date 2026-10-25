export const networks = [
  {
    fullName: 'Bitcoin',
    shortName: 'BTC',
    icon: '/networks/bitcoin.svg',
    description: [
      'Bitcoin is the original decentralized digital currency and the most widely recognized cryptocurrency. Fearless Wallet support focuses on native SegWit accounts for self-custody, receiving, sending, balance tracking, and transaction history.',
      'BTC is used as peer-to-peer digital money and a long-term store of value. In Fearless Wallet, Bitcoin support is built for one recovery phrase alongside the rest of your Universal Wallet accounts.'
    ],
    slug: 'bitcoin'
  },
  {
    fullName: 'Solana',
    shortName: 'SOL',
    icon: '/networks/solana.svg',
    description: [
      'Solana is a high-throughput blockchain designed for low-cost applications, payments, and token activity. Fearless Wallet supports native SOL accounts, SPL Token and Token-2022 visibility, transaction history, and browser-extension dApp connection flows.',
      'SOL is used for transaction fees, staking, and network operations. Fearless Wallet uses the public Solana indexer endpoint at si.soramitsu.io for wallet-facing reads and configured Solana RPC endpoints for simulation and broadcast.'
    ],
    slug: 'solana'
  },
  {
    fullName: 'Ethereum',
    shortName: 'ETH',
    icon: '/networks/Ethereum.svg',
    description: [
      'Ethereum is a decentralized global software platform built on blockchain technology. While investors recognize it for its native cryptocurrency, Ether (ETH), developers value it for enabling blockchain and decentralized finance (DeFi) application development.',
      'Open to anyone, Ethereum is designed to be scalable, programmable, secure, and decentralized, allowing users to create secure digital technologies. Its native token, Ether, is primarily used to compensate for work supporting the blockchain, but it can also be used to purchase goods and services where accepted.'
    ],
    slug: 'ethereum'
  },
  {
    fullName: 'The Open Network',
    shortName: 'TON',
    icon: '/networks/ton.svg',
    description: [
      'A decentralized and open internet designed to onboard 500M people on-chain, built by the community using technology developed by Telegram.',
      'Toncoin is TON`s native cryptocurrency. It is used for network operations, transactions, games or collectibles built on TON.'
    ],
    slug: 'ton'
  },
  {
    fullName: 'Polygon',
    shortName: 'MATIC',
    icon: '/networks/Polygon.svg',
    description: [
      'Polygon is a Layer 2 scaling solution designed to enhance Ethereum’s scalability and usability. It uses sidechains for off-chain computation, while ensuring asset security using the Plasma framework and a decentralized network of Proof-of-Stake validators.',
      'Polygon’s native token, MATIC, is used for governance, staking, and transaction fees, making the platform more efficient and accessible for decentralized application (dApp) developers.'
    ],
    slug: 'polygon'
  },
  {
    fullName: 'Kusama',
    shortName: 'KSM',
    icon: '/networks/Kusama.svg',
    description: [
      'Kusama is a scalable, multichain network designed as a “canary network” for Polkadot, allowing developers to test and deploy early-stage features and projects in a live environment.',
      'With faster governance and lower barriers to entry, Kusama is ideal for experimental blockchain projects. Its native token, KSM, is used for staking, governance, and to secure parachains within its ecosystem.'
    ],
    slug: 'kusama'
  },
  {
    fullName: 'Polkadot',
    shortName: 'DOT',
    icon: '/networks/Polkadot.svg',
    description: [
      'Polkadot is a scalable, interoperable blockchain platform designed to enable different blockchains to transfer messages, value, and data in a secure and trust-free environment.',
      'DOT, Polkadot’s native token, is used for staking, bonding new parachains, and governance over the network’s upgrades, allowing the platform to evolve according to the needs of its community.'
    ],
    slug: 'polkadot'
  },
  {
    fullName: 'BNB Chain',
    shortName: 'BNB',
    icon: '/networks/bnbchain.svg',
    description: [
      'BNB Chain, formerly Binance Smart Chain (BSC), is a high-performance blockchain supporting smart contracts and decentralized applications. It is compatible with Ethereum and known for low transaction fees and fast execution.',
      'BNB is the native token of BNB Chain, used for transaction fees, staking, and other network services, making it a crucial part of the Binance ecosystem.'
    ],
    slug: 'bnb'
  },
  {
    fullName: 'Arbitrum',
    shortName: 'ARB',
    icon: '/networks/Arbitrum.svg',
    description: [
      'Arbitrum is a Layer 2 scaling solution for Ethereum, designed to improve scalability and reduce transaction costs by enabling off-chain processing while preserving security.',
      'ARB, the native token, is used for governance and transaction fees, allowing users to interact more efficiently with decentralized applications (dApps) on the Ethereum network.'
    ],
    slug: 'arbitrum'
  },
  {
    fullName: 'SORA',
    shortName: 'XOR',
    icon: '/networks/SORA.svg',
    description: [
      'SORA is a decentralized economic system and a blockchain network that enables parachain functionality within the Polkadot ecosystem. It focuses on decentralized finance (DeFi) and applications that use digital assets.',
      'XOR, SORA’s native token, is used for transaction fees, staking, and governance. The network also supports the decentralized exchange Polkaswap.'
    ],
    slug: 'sora'
  },
  {
    fullName: 'SORA Nexus',
    shortName: 'NEXUS',
    icon: '/networks/SORA.svg',
    description: [
      'SORA Nexus is the Iroha-based SORA network tracked for the Universal Wallet rollout. It uses I105 account addresses derived from the same wallet phrase as the rest of Fearless Wallet.',
      'Nexus mainnet support is registry-gated until the production Torii TLS endpoint is confirmed. The public website lists the network so users can understand the roadmap without implying that mainnet writes are already enabled.'
    ],
    slug: 'nexus'
  },
  {
    fullName: 'Taira Testnet',
    shortName: 'TAIRA',
    icon: '/networks/SORA.svg',
    description: [
      'Taira is the SORA Iroha testnet used to validate Nexus-compatible account derivation, Torii reads, and wallet integration before mainnet release.',
      'Fearless Wallet derives Taira I105 testnet addresses from the Universal Wallet phrase and uses Taira-specific network validation so testnet and mainnet accounts do not collide.'
    ],
    slug: 'taira'
  },
  {
    fullName: 'Avalanche',
    shortName: 'AVAX',
    icon: '/networks/Avalanche.svg',
    description: [
      'Avalanche is a high-performance blockchain platform that aims to offer scalable solutions with low transaction costs, supporting a wide array of decentralized applications (dApps) and financial primitives.',
      'AVAX, the native token of Avalanche, is used for securing the network via staking, paying for transaction fees, and governance, ensuring the network remains decentralized and adaptable.'
    ],
    slug: 'avalanche'
  },
  {
    fullName: 'Moonbeam',
    shortName: 'GLMR',
    icon: '/networks/Moonbeam.svg',
    description: [
      'Moonbeam is a smart contract platform on Polkadot that provides full Ethereum compatibility, allowing developers to deploy existing Ethereum dApps on Polkadot with minimal changes.',
      'GLMR is Moonbeam’s native token, used for transaction fees, staking, and governance, bridging the gap between Ethereum and Polkadot for decentralized applications.'
    ],
    slug: 'moonbeam'
  },
  {
    fullName: 'Moonriver',
    shortName: 'MOVR',
    icon: '/networks/Moonriver.svg',
    description: [
      'Moonriver is a companion network to Moonbeam on Kusama, designed to support early-stage dApps and experiments before deploying on Moonbeam. It mirrors Moonbeam’s Ethereum compatibility and smart contract features.',
      'MOVR, the native token, is used for transaction fees, staking, and governance within the Moonriver network, enhancing the interoperability between Ethereum and Kusama.'
    ],
    slug: 'moonriver'
  },
  {
    fullName: 'XLayer',
    shortName: 'XL',
    icon: '/networks/xlayerchain.svg',
    description: [
      'XLayer is a cross-chain platform designed to enable scalable and secure interactions between various blockchains. It allows for the seamless transfer of assets and data across multiple blockchain networks.',
      'XL, the native token, is used for staking, governance, and transaction fees, providing users with a secure and efficient way to interact with different blockchains.'
    ],
    slug: 'xlayer'
  },
  {
    fullName: 'Kaia',
    shortName: 'KAI',
    icon: '/networks/kaia.svg',
    description: [
      'Kaia is a blockchain network focused on sustainability and environmental impact. It enables transparent, traceable solutions for environmental projects and carbon credit trading.',
      'KAI, the native token of Kaia, is used for governance, staking, and rewarding projects that contribute to environmental sustainability, making it a key part of the green economy on blockchain.'
    ],
    slug: 'kaia'
  },
  { fullName: 'Westend', icon: '/networks/Westend.svg' },
  { fullName: 'Kusama AssetHub', icon: '/networks/Assethub.svg' },
  { fullName: 'Polkadot AssetHub', icon: '/networks/Assethub.svg' },
  { fullName: 'Acala', icon: '/networks/acala.svg' },
  { fullName: 'Karura', icon: '/networks/Karura.svg' },
  { fullName: 'Shiden', icon: '/networks/Shiden.svg' },
  { fullName: 'Bifrost', icon: '/networks/Bifrost.svg' },
  { fullName: 'Khala', icon: '/networks/Khala.svg' },
  { fullName: 'KILT Spiritnet', icon: '/networks/kilt.svg' },
  { fullName: 'Calamari', icon: '/networks/Calamari.svg' },
  { fullName: 'Quartz', icon: '/networks/quartz.svg' },
  { fullName: 'Parallel Heiko', icon: '/networks/parallelfinance.svg' },
  { fullName: 'Picasso', icon: '/networks/picasso.svg' },
  { fullName: 'Altair', icon: '/networks/Altair.svg' },
  { fullName: 'Pioneer Network', icon: '/networks/bitcountry.svg' },
  { fullName: 'Clover', icon: '/networks/clover.svg' },
  { fullName: 'Astar', icon: '/networks/astar.svg' },
  { fullName: 'Parallel', icon: '/networks/parallelfinance.svg' },
  { fullName: 'Basilisk', icon: '/networks/Basilisk.svg' },
  { fullName: 'Kintsugi', icon: '/networks/kintsugi.svg' },
  { fullName: 'Genshiro', icon: '/networks/Genshiro.svg' },
  { fullName: 'Robonomics', icon: '/networks/robonomics.svg' },
  { fullName: 'Subsocial', icon: '/networks/subsocial_new.svg' },
  { fullName: 'Zeitgeist', icon: '/networks/zeitgeist.svg' },
  { fullName: 'HydraDX', icon: '/networks/hydradx.svg' },
  { fullName: 'Centrifuge', icon: '/networks/centrifuge.svg' },
  { fullName: 'Nodle Parachain', icon: '/networks/nodle.svg' },
  { fullName: 'Interlay', icon: '/networks/interlay.svg' },
  { fullName: 'Litmus', icon: '/networks/litmus.svg' },
  { fullName: 'Polkadex Main Network', icon: '/networks/polkadex.svg' },
  {
    fullName: 'OriginTrail Parachain',
    icon: '/networks/OriginTrail.svg'
  },
  { fullName: 'UNIQUE', icon: '/networks/unique.svg' },
  { fullName: 'Bifrost Polkadot', icon: '/networks/Bifrost.svg' },
  { fullName: 'Litentry', icon: '/networks/Litentry.svg' },
  { fullName: 'Phala', icon: '/networks/phala.svg' },
  { fullName: 'Composable Finance', icon: '/networks/composable.svg' },
  { fullName: 'Bajun Kusama', icon: '/networks/Bajun.svg' },
  { fullName: 'Kabocha', icon: '/networks/Kabocha.svg' },
  { fullName: 'Integritee Shell', icon: '/networks/integritee.svg' },
  { fullName: 'Turing Network', icon: '/networks/OAK.svg' },
  { fullName: 'Encointer on Kusama', icon: '/networks/encointer.svg' },
  {
    fullName: 'InvArch Tinker Network',
    icon: '/networks/Tinkernet.svg'
  },
  { fullName: 'Amplitude', icon: '/networks/Amplitude.svg' },
  {
    fullName: 'Crust Shadow Parachain',
    icon: '/networks/crustshadow.svg'
  },
  { fullName: 'SORA Mainnet', icon: '/networks/SORA.svg' },
  { fullName: 'Aleph Zero', icon: '/networks/Aleph%20Zero.svg' },
  { fullName: 'Kusama BridgeHub', icon: '/networks/Bridgehub.svg' },
  { fullName: 'Ipci', icon: '/networks/DAOIPCI.svg' },
  {
    fullName: 'Integritee Network (Kusama)',
    icon: '/networks/integritee.svg'
  },
  { fullName: 'Subzero', icon: '/networks/Subzero.svg' },
  { fullName: 'Ajuna Polkadot', icon: '/networks/Bajun.svg' },
  { fullName: 'Bitgreen', icon: '/networks/Bitgreen.svg' },
  { fullName: 'Crust', icon: '/networks/Crust.svg' },
  { fullName: 'Frequency', icon: '/networks/Frequency.svg' },
  { fullName: 'Pendulum', icon: '/networks/Pendulum.svg' },
  { fullName: 'Ternoa Mainnet', icon: '/networks/Ternoa.svg' },
  { fullName: 'BNB Smart Chain', icon: '/networks/bnbchain.svg' },
  { fullName: 'Enjin Matrixchain', icon: '/networks/Enjin.svg' },
  { fullName: 'Canary Matrixchain', icon: '/networks/Enjin.svg' },
  { fullName: 'Arbitrum One', icon: '/networks/Arbitrum.svg' },
  { fullName: 'OP Mainnet', icon: '/networks/Optimism.svg' },
  { fullName: 'Avalanche C-Chain', icon: '/networks/Avalanche.svg' },
  { fullName: 'Polygon zkEVM', icon: '/networks/Polygon.svg' },
  { fullName: 'ZetaChain Testnet', icon: '/networks/Zetachain.svg' },
  { fullName: 'Reef Mainnet', icon: '/networks/reefchain.svg' },
  { fullName: 'Manta Parachain', icon: '/networks/mantachain.svg' },
  { fullName: 'Liberland', icon: '/networks/liberland.svg' },
  { fullName: 'Oasys Mainnet', icon: '/networks/oasys.svg' },
  { fullName: 'CAGA Ankara Testnet', icon: '/networks/cagachain.svg' },
  { fullName: 'XX network', icon: '/networks/xxnetwork.svg' },
  { fullName: 'Avail Turing Testnet', icon: '/networks/Avail.svg' },
  { fullName: 'X Layer Mainnet', icon: '/networks/xlayerchain.svg' },
  { fullName: 'Analog Testnet', icon: '/networks/Analog.svg' },
  { fullName: 'Kusama People', icon: '/networks/People.svg' },
  { fullName: 'Avail DA Mainnet', icon: '/networks/Avail.svg' },
  { fullName: 'Atleta Olympia', icon: '/networks/Atleta.svg' },
  { fullName: 'ZChains', icon: '/networks/zchain.svg' }
]
