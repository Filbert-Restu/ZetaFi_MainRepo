import { Networks } from '@stellar/stellar-sdk';

export const STELLAR_NETWORK = process.env.STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET;
export const STELLAR_RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

export const CONTRACT_IDS = {
  ledger: process.env.LEDGER_CONTRACT_ID || '',
  creditScore: process.env.CREDIT_SCORE_CONTRACT_ID || '',
  lendingPool: process.env.LENDING_POOL_CONTRACT_ID || '',
};
