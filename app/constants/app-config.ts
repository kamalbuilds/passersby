import { AppIdentity, createSolanaDevnet, createSolanaMainnet, SolanaCluster } from '@wallet-ui/react-native-kit'
import { ACTIVE_CLUSTER } from '@/constants/cluster'

export class AppConfig {
  static identity: AppIdentity = {
    name: 'Passersby',
    uri: 'passersby://app',
  }
  static cluster: SolanaCluster =
    ACTIVE_CLUSTER.key === 'mainnet'
      ? createSolanaMainnet({ url: ACTIVE_CLUSTER.rpcUrl })
      : createSolanaDevnet({ url: ACTIVE_CLUSTER.rpcUrl })
}
