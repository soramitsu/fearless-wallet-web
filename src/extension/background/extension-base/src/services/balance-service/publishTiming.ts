/**
 * How balance changes reach the open wallet pages. A page is sent the selected wallet's balances once changes stop
 * for BALANCE_PUBLISH_DELAY_MS, which gathers one network's assets into one message, and no later than
 * BALANCE_PUBLISH_MAX_WAIT_MS after the first of them. Without the limit a wallet on many networks was sent nothing
 * until the last network had answered: each answer postponed the message again.
 */
export const BALANCE_PUBLISH_DELAY_MS = 120;
export const BALANCE_PUBLISH_MAX_WAIT_MS = 400;
