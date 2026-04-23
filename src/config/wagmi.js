import { createConfig, http } from "wagmi"
import { avalanche } from "wagmi/chains"
import { injected } from "wagmi/connectors"

export const config = createConfig({
  chains: [avalanche],
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  transports: {
    [avalanche.id]: http(),
  },
})