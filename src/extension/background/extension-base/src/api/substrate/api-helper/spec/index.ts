// Copyright 2017-2022 @polkadot/apps-config authors & contributors
// SPDX-License-Identifier: Apache-2.0

import acala from './acala';
import altair from './altair';
import astar from './astar';
import basilisk from './basilisk';
import bifrost from './bifrost';
import bifrostAsgard from './bifrost-asgard';
import bifrostParachain from './bifrost-parachain';
import bitcountry from './bitcountry';
import bitcountryParachain from './bitcountry-rococo';
import canvas from './canvas';
import centrifuge from './centrifuge';
import centrifugeChain from './centrifuge-chain';
import chainx from './chainx';
import clover from './clover';
import cloverRococo from './clover-rococo';
import coinversation from './coinversation';
import competitorsClub from './competitors-club';
import crab from './crab';
import crownSterlingChain from './crown-sterling';
import crust from './crust';
import testPara from './cumulus-test-parachain';
import darwinia from './darwinia';
import datahighwayParachain from './datahighway';
import encointerNodeNotee from './encointer-node-notee';
import encointerNodeTeeproxy from './encointer-node-teeproxy';
import encointerPara from './encointer-para';
import equilibrium from './equilibrium';
import galital from './galital';
import galitalParachain from './galital-parachain';
import galois from './galois';
import genshiro from './genshiro';
import hanonycash from './hanonycash';
import hydrate from './hydrate';
import idavoll from './idavoll';
import integritee from './integritee';
import interbtc from './interbtc';
import ipse from './ipse';
import jupiter from './jupiter';
import jupiterRococo from './jupiter-rococo';
import khala from './khala';
import kilt from './kilt';
import konomi from './konomi';
import kpron from './kpron';
import kulupu from './kulupu';
import kusari from './kusari';
import kylin from './kylin';
import laminar from './laminar';
import litentry from './litentry';
import mangata from './mangata';
import manta from './manta';
import mathchain from './mathchain';
import moonbeam from './moonbeam';
import mybank from './mybank';
import neatcoin from './neatcoin';
import neumann from './neumann';
import nodle from './nodle';
import pangolin from './pangolin';
import pangoro from './pangoro';
import parami from './parami';
import phoenix from './phoenix';
import pichiu from './pichiu';
import plasm from './plasm';
import polkadex from './polkadex';
import polkafoundry from './polkafoundry';
import prism from './prism';
import realis from './realis';
import riochain from './riochain';
import robonomics from './robonomics';
import shibuya from './shibuya';
import shiden from './shiden';
import soraSubstrate from './soraSubstrate';
import spanner from './spanner';
import stafi from './stafi';
import subdao from './subdao';
// import subspace from './subspace';
import substrateContractsNode from './substrateContractsNode';
import swapdex from './swapdex';
import ternoa from './ternoa';
import trustbase from './trustbase';
import uart from './uart';
import unique from './unique';
import unitv from './unitv';
import vln from './vln';
import vlnrococo from './vln-rococo';
import westlake from './westlake';
import zCloak from './zCloak';
import zenlink from './zenlink';
import type { OverrideBundleDefinition } from '@polkadot/types/types';

// NOTE: The mapping is done from specName in state.getRuntimeVersion
const spec: Record<string, OverrideBundleDefinition> = {
  Crab: crab,
  Darwinia: darwinia,
  'Darwinia Crab PC2': pangolin,
  'Darwinia PC2': pangolin,
  Equilibrium: equilibrium,
  Genshiro: genshiro,
  Pangolin: pangolin,
  Pangoro: pangoro,
  VLN: vln,
  'VLN-PC': vlnrococo,
  ...acala,
  altair,
  asgard: bifrostAsgard,
  astar,
  basilisk,
  bifrost: bifrost,
  'bifrost-parachain': bifrostParachain,
  'bitcountry-node': bitcountry,
  'bitcountry-parachain': bitcountryParachain,
  canvas,
  centrifuge,
  'centrifuge-chain': centrifugeChain,
  chainx,
  'chainx-parachain': chainx,
  clover,
  'clover-rococo': cloverRococo,
  coinversation,
  'competitors-club': competitorsClub,
  'crown-sterling': crownSterlingChain,
  crust,
  'crust-parachain': crust,
  'cumulus-test-parachain': testPara,
  datahighway: westlake,
  'datahighway-parachain': datahighwayParachain,
  'dev-parachain': zenlink,
  'encointer-node-notee': encointerNodeNotee,
  'encointer-node-teeproxy': encointerNodeTeeproxy,
  'encointer-parachain': encointerPara,
  galital: galital,
  'galital-collator': galitalParachain,
  'hack-hydra-dx': hydrate,
  halongbay: polkafoundry,
  hanonycash,
  'hydra-dx': hydrate,
  idavoll,
  'integritee-parachain': integritee,
  'interbtc-parachain': interbtc,
  'interbtc-standalone': interbtc,
  'ipse-node': ipse,
  'jupiter-prep': jupiter,
  'jupiter-rococo': jupiterRococo,
  khala,
  'kilt-parachain': kilt,
  'kilt-spiritnet': kilt,
  'kintsugi-parachain': interbtc,
  konomi,
  kpron,
  kulupu,
  kusari,
  kylin,
  laminar,
  litentry,
  mangata: mangata,
  'manta-node': manta,
  'mashnet-node': kilt,
  mathchain,
  'mathchain-galois': galois,
  moonbase: moonbeam,
  moonbeam,
  moonriver: moonbeam,
  moonshadow: moonbeam,
  'mybank.network Testnet': mybank,
  neatcoin,
  neumann,
  nft: unique,
  'node-polkadex': polkadex,
  'nodle-chain': nodle,
  parami,
  'phoenix-node': phoenix,
  'phoenix-parachain': phoenix,
  pichiu,
  plasm,
  prism,
  realis,
  'riochain-runtime': riochain,
  robonomics,
  shibuya,
  shiden,
  'sora-substrate': soraSubstrate,
  sora_ksm: soraSubstrate,
  spanner,
  stafi,
  subdao,
  // subspace,
  'substrate-contracts-node': substrateContractsNode,
  swapdex,
  ternoa,
  trustbase,
  uart,
  'unit-node': unitv,
  'unit-parachain': unitv,
  'zcloak-network': zCloak,
};

export default spec;
