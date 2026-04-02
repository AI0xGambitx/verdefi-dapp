import { createConfig, http } from 'wagmi'
import { avalancheFuji } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [avalancheFuji],
  connectors: [
    injected({
      target: 'metaMask', // 🔥 FORZAMOS MetaMask
    }),
  ],
  transports: {
    [avalancheFuji.id]: http(),
  },
})