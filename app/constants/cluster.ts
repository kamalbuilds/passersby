import { address, type Address } from '@solana/kit'

export type ClusterKey = 'devnet' | 'mainnet'

export type ClusterConfig = {
  key: ClusterKey
  walletChain: 'solana:devnet' | 'solana:mainnet'
  rpcUrl: string
  /** Null where the Passersby program is not deployed. */
  programId: Address | null
  skrMint: Address
  skrLabel: string
  explorerParam: string
  networkLabel: string
}

/** One entry per cluster. A mainnet build flips EXPO_PUBLIC_CLUSTER=mainnet once the program is deployed there. */
export const CLUSTERS: Record<ClusterKey, ClusterConfig> = {
  devnet: {
    key: 'devnet',
    walletChain: 'solana:devnet',
    rpcUrl: process.env.EXPO_PUBLIC_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com',
    programId: address('H15pvqJFh7isY3fMX4oZe2ezZ8xjM4RZmv2uemQhv1g2'),
    skrMint: address('3BySLyP6nGFKDfFdfcsuT4ZmcndDsnsiLsHMCToT5i5V'),
    skrLabel: 'SKR (devnet)',
    explorerParam: '?cluster=devnet',
    networkLabel: 'devnet',
  },
  mainnet: {
    key: 'mainnet',
    walletChain: 'solana:mainnet',
    rpcUrl: process.env.EXPO_PUBLIC_MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
    programId: null,
    skrMint: address('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'),
    skrLabel: 'SKR',
    explorerParam: '',
    networkLabel: 'mainnet',
  },
}

export const ACTIVE_CLUSTER: ClusterConfig =
  process.env.EXPO_PUBLIC_CLUSTER === 'mainnet' ? CLUSTERS.mainnet : CLUSTERS.devnet

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${ACTIVE_CLUSTER.explorerParam}`
}
