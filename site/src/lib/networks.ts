import type { NetworkInfo } from './constants/types'

const networks: {
  [key: string]: NetworkInfo
} = {
  bitcoin: {
    fullName: 'Bitcoin',
    shortName: 'BTC',
    icon: '/networks/bitcoin.svg',
    description: [
      'Bitcoin is the original decentralized digital currency and the most widely recognized cryptocurrency. Fearless Wallet support focuses on native SegWit accounts for self-custody, receiving, sending, balance tracking, and transaction history.',
      'BTC is used as peer-to-peer digital money and a long-term store of value. In Fearless Wallet, Bitcoin support is built for one recovery phrase alongside the rest of your Universal Wallet accounts.',
    ],
  },
  solana: {
    fullName: 'Solana',
    shortName: 'SOL',
    icon: '/networks/solana.svg',
    description: [
      'Solana is a high-throughput blockchain designed for low-cost applications, payments, and token activity. Fearless Wallet supports native SOL accounts, SPL Token and Token-2022 visibility, transaction history, and browser-extension dApp connection flows.',
      'SOL is used for transaction fees, staking, and network operations. Fearless Wallet uses the public Solana indexer endpoint at si.soramitsu.io for wallet-facing reads and configured Solana RPC endpoints for simulation and broadcast.',
    ],
  },
  ethereum: {
    fullName: 'Ethereum',
    shortName: 'ETH',
    icon: '/networks/Ethereum.svg',
    description: [
      'Ethereum is a decentralized global software platform built on blockchain technology. While investors recognize it for its native cryptocurrency, Ether (ETH), developers value it for enabling blockchain and decentralized finance (DeFi) application development.',
      'Open to anyone, Ethereum is designed to be scalable, programmable, secure, and decentralized, allowing users to create secure digital technologies. Its native token, Ether, is primarily used to compensate for work supporting the blockchain, but it can also be used to purchase goods and services where accepted.',
    ],
  },
  ton: {
    fullName: 'The Open Network',
    shortName: 'TON',
    icon: '/networks/ton.svg',
    description: [
      'A decentralized and open internet designed to onboard 500M people on-chain, built by the community using technology developed by Telegram.',
      'Toncoin is TON`s native cryptocurrency. It is used for network operations, transactions, games or collectibles built on TON.',
    ],
  },
  polygon: {
    fullName: 'Polygon',
    shortName: 'MATIC',
    icon: '/networks/Polygon.svg',
    description: [
      'Polygon is a Layer 2 scaling solution designed to enhance Ethereum’s scalability and usability. It uses sidechains for off-chain computation, while ensuring asset security using the Plasma framework and a decentralized network of Proof-of-Stake validators.',
      'Polygon’s native token, MATIC, is used for governance, staking, and transaction fees, making the platform more efficient and accessible for decentralized application (dApp) developers.',
    ],
  },
  kusama: {
    fullName: 'Kusama',
    shortName: 'KSM',
    icon: '/networks/Kusama.svg',
    description: [
      'Kusama is a scalable, multichain network designed as a “canary network” for Polkadot, allowing developers to test and deploy early-stage features and projects in a live environment.',
      'With faster governance and lower barriers to entry, Kusama is ideal for experimental blockchain projects. Its native token, KSM, is used for staking, governance, and to secure parachains within its ecosystem.',
    ],
  },
  polkadot: {
    fullName: 'Polkadot',
    shortName: 'DOT',
    icon: '/networks/Polkadot.svg',
    description: [
      'Polkadot is a scalable, interoperable blockchain platform designed to enable different blockchains to transfer messages, value, and data in a secure and trust-free environment.',
      'DOT, Polkadot’s native token, is used for staking, bonding new parachains, and governance over the network’s upgrades, allowing the platform to evolve according to the needs of its community.',
    ],
  },
  bnb: {
    fullName: 'BNB Chain',
    shortName: 'BNB',
    icon: '/networks/bnbchain.svg',
    description: [
      'BNB Chain, formerly Binance Smart Chain (BSC), is a high-performance blockchain supporting smart contracts and decentralized applications. It is compatible with Ethereum and known for low transaction fees and fast execution.',
      'BNB is the native token of BNB Chain, used for transaction fees, staking, and other network services, making it a crucial part of the Binance ecosystem.',
    ],
  },
  arbitrum: {
    fullName: 'Arbitrum',
    shortName: 'ARB',
    icon: '/networks/Arbitrum.svg',
    description: [
      'Arbitrum is a Layer 2 scaling solution for Ethereum, designed to improve scalability and reduce transaction costs by enabling off-chain processing while preserving security.',
      'ARB, the native token, is used for governance and transaction fees, allowing users to interact more efficiently with decentralized applications (dApps) on the Ethereum network.',
    ],
  },
  sora: {
    fullName: 'SORA',
    shortName: 'XOR',
    icon: '/networks/SORA.svg',
    description: [
      'SORA is a decentralized economic system and a blockchain network that enables parachain functionality within the Polkadot ecosystem. It focuses on decentralized finance (DeFi) and applications that use digital assets.',
      'XOR, SORA’s native token, is used for transaction fees, staking, and governance. The network also supports the decentralized exchange Polkaswap.',
    ],
  },
  nexus: {
    fullName: 'SORA Nexus',
    shortName: 'NEXUS',
    icon: '/networks/SORA.svg',
    description: [
      'SORA Nexus is the Iroha-based SORA network tracked for the Universal Wallet rollout. It uses I105 account addresses derived from the same wallet phrase as the rest of Fearless Wallet.',
      'Nexus mainnet support is registry-gated until the production Torii TLS endpoint is confirmed. The public website lists the network so users can understand the roadmap without implying that mainnet writes are already enabled.',
    ],
  },
  taira: {
    fullName: 'Taira Testnet',
    shortName: 'TAIRA',
    icon: '/networks/SORA.svg',
    description: [
      'Taira is the SORA Iroha testnet used to validate Nexus-compatible account derivation, Torii reads, and wallet integration before mainnet release.',
      'Fearless Wallet derives Taira I105 testnet addresses from the Universal Wallet phrase and uses Taira-specific network validation so testnet and mainnet accounts do not collide.',
    ],
  },
  avalanche: {
    fullName: 'Avalanche',
    shortName: 'AVAX',
    icon: '/networks/Avalanche.svg',
    description: [
      'Avalanche is a high-performance blockchain platform that aims to offer scalable solutions with low transaction costs, supporting a wide array of decentralized applications (dApps) and financial primitives.',
      'AVAX, the native token of Avalanche, is used for securing the network via staking, paying for transaction fees, and governance, ensuring the network remains decentralized and adaptable.',
    ],
  },
  moonbeam: {
    fullName: 'Moonbeam',
    shortName: 'GLMR',
    icon: '/networks/Moonbeam.svg',
    description: [
      'Moonbeam is a smart contract platform on Polkadot that provides full Ethereum compatibility, allowing developers to deploy existing Ethereum dApps on Polkadot with minimal changes.',
      'GLMR is Moonbeam’s native token, used for transaction fees, staking, and governance, bridging the gap between Ethereum and Polkadot for decentralized applications.',
    ],
  },
  moonriver: {
    fullName: 'Moonriver',
    shortName: 'MOVR',
    icon: '/networks/Moonriver.svg',
    description: [
      'Moonriver is a companion network to Moonbeam on Kusama, designed to support early-stage dApps and experiments before deploying on Moonbeam. It mirrors Moonbeam’s Ethereum compatibility and smart contract features.',
      'MOVR, the native token, is used for transaction fees, staking, and governance within the Moonriver network, enhancing the interoperability between Ethereum and Kusama.',
    ],
  },
  xlayer: {
    fullName: 'XLayer',
    shortName: 'XL',
    icon: '/networks/xlayerchain.svg',
    description: [
      'XLayer is a cross-chain platform designed to enable scalable and secure interactions between various blockchains. It allows for the seamless transfer of assets and data across multiple blockchain networks.',
      'XL, the native token, is used for staking, governance, and transaction fees, providing users with a secure and efficient way to interact with different blockchains.',
    ],
  },
  kaia: {
    fullName: 'Kaia',
    shortName: 'KAI',
    icon: '/networks/kaia.svg',
    description: [
      'Kaia is a blockchain network focused on sustainability and environmental impact. It enables transparent, traceable solutions for environmental projects and carbon credit trading.',
      'KAI, the native token of Kaia, is used for governance, staking, and rewarding projects that contribute to environmental sustainability, making it a key part of the green economy on blockchain.',
    ],
  },
}

export default networks
