import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { avalanche } from "wagmi/chains"

export const config = getDefaultConfig({
  appName: "VerdeFi",
  projectId: "0ac6605f7fed49a543cf5079a323a20d",
  chains: [avalanche],
})