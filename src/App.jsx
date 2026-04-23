import { useMemo, useState } from "react"
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi"
import { waitForTransactionReceipt } from "@wagmi/core"
import { parseUnits, formatUnits } from "viem"

import { config } from "./config/wagmi"
import { CONTRACTS } from "./contracts/addresses"
import {
  mockUsdcAbi,
  verdeTokenAbi,
  verdeVaultAbi,
} from "./contracts/abis"

const AVALANCHE_MAINNET_CHAIN_ID = 43114
const STORAGE_KEY_LAST_REQUEST_ID = "verdefi_last_request_id"

function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  const [depositAmount, setDepositAmount] = useState("100")
  const [withdrawAmount, setWithdrawAmount] = useState("2000")
  const [claimId, setClaimId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_LAST_REQUEST_ID) || ""
  })
  const [loadingAction, setLoadingAction] = useState("")
  const [txMessage, setTxMessage] = useState("")

  const metaMaskConnector = useMemo(() => {
    return connectors.find(
      (c) =>
        c.name?.toLowerCase().includes("metamask") ||
        c.id?.toLowerCase().includes("metamask")
    )
  }, [connectors])

  const isCorrectNetwork = chainId === AVALANCHE_MAINNET_CHAIN_ID

  const handleConnect = () => {
    if (!metaMaskConnector) {
      alert("MetaMask not detected.")
      return
    }
    connect({ connector: metaMaskConnector })
  }

  const shortenAddress = (value) => {
    if (!value) return "-"
    return `${value.slice(0, 6)}...${value.slice(-4)}`
  }

  const formatUSDC = (value) => {
    if (value === undefined || value === null) return "—"
    return Number(formatUnits(value, 6)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })
  }

  const formatVERDE = (value) => {
    if (value === undefined || value === null) return "—"
    return Number(formatUnits(value, 18)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })
  }

  const formatAVAX = (value) => {
    if (!value?.formatted) return "—"
    return Number(value.formatted).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }

  const saveRequestId = (id) => {
    const normalized = String(id)
    setClaimId(normalized)
    localStorage.setItem(STORAGE_KEY_LAST_REQUEST_ID, normalized)
  }

  const clearRequestId = () => {
    setClaimId("")
    localStorage.removeItem(STORAGE_KEY_LAST_REQUEST_ID)
  }

  const { data: avaxBalance } = useBalance({
    address,
    query: { enabled: !!address && isCorrectNetwork },
  })

  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: CONTRACTS.mockUsdc,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: AVALANCHE_MAINNET_CHAIN_ID,
    query: { enabled: !!address && isCorrectNetwork },
  })

  const { data: verdeBalance, refetch: refetchVerdeBalance } = useReadContract({
    address: CONTRACTS.verdeToken,
    abi: verdeTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: AVALANCHE_MAINNET_CHAIN_ID,
    query: { enabled: !!address && isCorrectNetwork },
  })

  const { data: quoteVerdeOut, refetch: refetchQuoteVerdeOut } = useReadContract({
    address: CONTRACTS.verdeVault,
    abi: verdeVaultAbi,
    functionName: "quoteVerdeOut",
    args: [parseUnits("100", 6)],
    chainId: AVALANCHE_MAINNET_CHAIN_ID,
    query: { enabled: isCorrectNetwork },
  })

  const { data: quoteUsdcGross, refetch: refetchQuoteUsdcGross } = useReadContract({
    address: CONTRACTS.verdeVault,
    abi: verdeVaultAbi,
    functionName: "quoteUsdcGross",
    args: [parseUnits("2000", 18)],
    chainId: AVALANCHE_MAINNET_CHAIN_ID,
    query: { enabled: isCorrectNetwork },
  })

  const { data: withdrawRequestsCount, refetch: refetchWithdrawRequestsCount } =
    useReadContract({
      address: CONTRACTS.verdeVault,
      abi: verdeVaultAbi,
      functionName: "withdrawRequestsCount",
      chainId: AVALANCHE_MAINNET_CHAIN_ID,
      query: { enabled: isCorrectNetwork },
    })

  const refreshData = async () => {
    await Promise.all([
      refetchUsdcBalance(),
      refetchVerdeBalance(),
      refetchQuoteVerdeOut(),
      refetchQuoteUsdcGross(),
      refetchWithdrawRequestsCount(),
    ])
  }

  const handleDeposit = async () => {
    if (!isConnected) {
      setTxMessage("Connect your wallet first.")
      return
    }

    if (!isCorrectNetwork) {
      setTxMessage("Wrong network. Please switch to Avalanche Mainnet.")
      return
    }

    try {
      setLoadingAction("deposit")
      setTxMessage("Approving USDC spending...")

      const amount = parseUnits(depositAmount, 6)

      const approveHash = await writeContractAsync({
        address: CONTRACTS.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [CONTRACTS.verdeVault, amount],
        chainId: AVALANCHE_MAINNET_CHAIN_ID,
      })

      await waitForTransactionReceipt(config, { hash: approveHash })

      setTxMessage("Approval confirmed. Depositing USDC...")

      const depositHash = await writeContractAsync({
        address: CONTRACTS.verdeVault,
        abi: verdeVaultAbi,
        functionName: "deposit",
        args: [amount],
        chainId: AVALANCHE_MAINNET_CHAIN_ID,
      })

      await waitForTransactionReceipt(config, { hash: depositHash })

      setTxMessage(`Deposit confirmed. VERDE minted successfully. Tx: ${depositHash}`)
      await refreshData()
    } catch (err) {
      setTxMessage(
        `Deposit failed: ${err?.shortMessage || err?.message || "Unknown error"}`
      )
    } finally {
      setLoadingAction("")
    }
  }

  const handleWithdrawRequest = async () => {
    if (!isConnected) {
      setTxMessage("Connect your wallet first.")
      return
    }

    if (!isCorrectNetwork) {
      setTxMessage("Wrong network. Please switch to Avalanche Mainnet.")
      return
    }

    try {
      setLoadingAction("request")
      setTxMessage("Submitting withdraw request...")

      const amount = parseUnits(withdrawAmount, 18)

      const hash = await writeContractAsync({
        address: CONTRACTS.verdeVault,
        abi: verdeVaultAbi,
        functionName: "requestWithdraw",
        args: [amount],
        chainId: AVALANCHE_MAINNET_CHAIN_ID,
      })

      await waitForTransactionReceipt(config, { hash })
      await refreshData()

      const nextId =
        withdrawRequestsCount !== undefined
          ? Number(withdrawRequestsCount)
          : null

      if (nextId !== null) {
        const actualId = String(nextId)
        saveRequestId(actualId)
        setTxMessage(
          `Withdrawal requested successfully. Your Request ID is #${actualId}. Save it to claim your funds after 24h.`
        )
      } else {
        setTxMessage(`Withdraw request submitted successfully. Tx: ${hash}`)
      }
    } catch (err) {
      setTxMessage(
        `Withdraw request failed: ${err?.shortMessage || err?.message || "Unknown error"}`
      )
    } finally {
      setLoadingAction("")
    }
  }

  const handleClaim = async () => {
    if (!isConnected) {
      setTxMessage("Connect your wallet first.")
      return
    }

    if (!isCorrectNetwork) {
      setTxMessage("Wrong network. Please switch to Avalanche Mainnet.")
      return
    }

    if (!claimId) {
      setTxMessage("Enter a valid request ID first.")
      return
    }

    try {
      setLoadingAction("claim")
      setTxMessage(`Claiming request ID ${claimId}...`)

      const hash = await writeContractAsync({
        address: CONTRACTS.verdeVault,
        abi: verdeVaultAbi,
        functionName: "claimWithdraw",
        args: [BigInt(claimId)],
        chainId: AVALANCHE_MAINNET_CHAIN_ID,
      })

      await waitForTransactionReceipt(config, { hash })

      setTxMessage(`Claim completed successfully. USDC released. Tx: ${hash}`)
      await refreshData()
    } catch (err) {
      setTxMessage(
        `Claim failed: ${err?.shortMessage || err?.message || "Unknown error"}`
      )
    } finally {
      setLoadingAction("")
    }
  }

  const latestRequestId =
    withdrawRequestsCount !== undefined && Number(withdrawRequestsCount) > 0
      ? Number(withdrawRequestsCount) - 1
      : "—"

  const displayedNetwork = isConnected
    ? isCorrectNetwork
      ? "Avalanche Mainnet (43114)"
      : chainId
      ? `Wrong Network (${chainId})`
      : "Unknown Network"
    : "—"

  return (
    <div style={styles.page}>
      <div style={styles.bgGlowTop} />
      <div style={styles.bgGlowCenter} />

      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
           <div style={styles.brandRow}>
            <img src="/logo.png" alt="VerdeFi logo" style={styles.logoFull} />
          </div>
          <div style={styles.tagline}>Cannabis-backed DeFi on Avalanche</div>
      </div>  

          {!isConnected ? (
            <button style={styles.headerButton} onClick={handleConnect}>
              Connect Wallet
            </button>
          ) : (
            <div style={styles.walletBox}>
              <span style={styles.walletAddress}>{shortenAddress(address)}</span>
              <button style={styles.disconnectButton} onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          )}
        </header>

        <main style={styles.main}>
          <section style={styles.hero}>
            <div style={styles.heroBadge}>Dashboard</div>
            <h1 style={styles.heroTitle}>Mint, request, and claim with VerdeFi</h1>
            <p style={styles.heroText}>
              A simple on-chain interface to interact with the VerdeVault on Avalanche Mainnet.
            </p>
          </section>

          {!isConnected && (
            <section style={styles.statusWrap}>
              <div style={styles.statusTitle}>Wallet Status</div>
              <div style={styles.statusText}>
                Connect your wallet to use VerdeFi on Avalanche Mainnet.
              </div>
            </section>
          )}

          {isConnected && (
            <section style={styles.statsGrid}>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Wallet</span>
                <span style={styles.statValue}>{shortenAddress(address)}</span>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Network</span>
                <span
                  style={{
                    ...styles.statValue,
                    color: isCorrectNetwork ? "#FFFFFF" : "#ff8e8e",
                  }}
                >
                  {displayedNetwork}
                </span>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>AVAX Balance</span>
                <span style={styles.statValue}>{formatAVAX(avaxBalance)} AVAX</span>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Latest Request ID</span>
                <span style={styles.statValue}>{latestRequestId}</span>
              </div>
            </section>
          )}

          {isConnected && (
            <section style={styles.infoGrid}>
              <div style={styles.infoPanel}>
                <div style={styles.panelTitle}>Portfolio</div>
                <div style={styles.infoRow}>
                  <span style={styles.infoKey}>USDC</span>
                  <span style={styles.infoValue}>{formatUSDC(usdcBalance)}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoKey}>VERDE</span>
                  <span style={styles.infoValue}>{formatVERDE(verdeBalance)}</span>
                </div>
              </div>

              <div style={styles.infoPanel}>
                <div style={styles.panelTitle}>Vault Quotes</div>
                <div style={styles.infoRow}>
                  <span style={styles.infoKey}>100 USDC → VERDE</span>
                  <span style={styles.infoValue}>{formatVERDE(quoteVerdeOut)}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoKey}>2000 VERDE → USDC</span>
                  <span style={styles.infoValue}>{formatUSDC(quoteUsdcGross)}</span>
                </div>
                <div style={styles.infoRow}>
                  <span style={styles.infoKey}>Withdraw Requests</span>
                  <span style={styles.infoValue}>
                    {withdrawRequestsCount !== undefined
                      ? withdrawRequestsCount.toString()
                      : "—"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {isConnected && !isCorrectNetwork && (
            <section style={styles.statusWrapError}>
              <div style={styles.statusTitle}>Network Warning</div>
              <div style={styles.statusText}>
                Wrong network detected. Please switch MetaMask to Avalanche Mainnet
                before depositing, requesting, or claiming.
              </div>

              <button
                style={styles.switchNetworkButton}
                onClick={() => switchChain({ chainId: AVALANCHE_MAINNET_CHAIN_ID })}
              >
                Switch to Avalanche Mainnet
              </button>
            </section>
          )}

          <section style={styles.cardsGrid}>
            <div style={{ ...styles.actionCard, ...styles.cardDeposit }}>
              <div style={styles.cardAccentGreen} />
              <div style={styles.cardTop}>
                <div style={styles.cardIcon}>↗</div>
                <div>
                  <div style={styles.cardTitle}>Deposit</div>
                  <div style={styles.cardSubtitle}>
                    Deposit USDC to mint VERDE at protocol rate
                  </div>
                </div>
              </div>

              <input
                style={styles.input}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder="100"
              />

              <button
                style={{ ...styles.actionButton, ...styles.buttonDeposit }}
                onClick={handleDeposit}
                disabled={loadingAction !== "" || !isConnected || !isCorrectNetwork}
              >
                {loadingAction === "deposit" ? "Processing..." : "Approve + Deposit"}
              </button>
            </div>

            <div style={{ ...styles.actionCard, ...styles.cardRequest }}>
              <div style={styles.cardAccentGold} />
              <div style={styles.cardTop}>
                <div style={styles.cardIcon}>⇄</div>
                <div>
                  <div style={styles.cardTitle}>Request Withdraw</div>
                  <div style={styles.cardSubtitle}>
                    Burn VERDE to create a withdrawal request (24h delay)
                  </div>
                </div>
              </div>

              <input
                style={styles.input}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder="2000"
              />

              <div style={styles.helperText}>Withdrawal delay: 24 hours</div>

              <button
                style={{ ...styles.actionButton, ...styles.buttonRequest }}
                onClick={handleWithdrawRequest}
                disabled={loadingAction !== "" || !isConnected || !isCorrectNetwork}
              >
                {loadingAction === "request" ? "Processing..." : "Request Withdraw"}
              </button>
            </div>

            <div style={{ ...styles.actionCard, ...styles.cardClaim }}>
              <div style={styles.cardAccentBlue} />
              <div style={styles.cardTop}>
                <div style={styles.cardIcon}>✓</div>
                <div>
                  <div style={styles.cardTitle}>Claim Withdraw</div>
                  <div style={styles.cardSubtitle}>
                    Claim released USDC using your Request ID
                  </div>
                </div>
              </div>

              <input
                style={{
                  ...styles.input,
                  MozAppearance: "textfield",
                }}
                value={claimId}
                onChange={(e) => setClaimId(e.target.value)}
                type="text"
                inputMode="numeric"
                placeholder="Enter your Request ID"
              />

              <div style={styles.requestIdBox}>
                {claimId ? (
                  <>
                    <div style={styles.requestIdLabel}>Request ID to Claim</div>
                    <div style={styles.requestIdValue}>#{claimId}</div>
                    <div style={styles.requestIdHint}>
                      Save this ID. You will need it to claim your funds.
                    </div>
                  </>
                ) : (
                  <div style={styles.requestIdEmpty}>No request ID stored yet</div>
                )}

                {claimId && (
                  <button style={styles.clearButton} onClick={clearRequestId}>
                    Clear
                  </button>
                )}
              </div>

              <button
                style={{ ...styles.actionButton, ...styles.buttonClaim }}
                onClick={handleClaim}
                disabled={loadingAction !== "" || !isConnected || !isCorrectNetwork}
              >
                {loadingAction === "claim"
                  ? "Processing..."
                  : `Claim ${claimId ? `#${claimId}` : "Withdraw"}`}
              </button>
            </div>
          </section>

          <section style={styles.statusWrap}>
            <div style={styles.statusHeader}>
              <div style={styles.statusDot} />
              <div style={styles.statusTitleMain}>Transaction Status</div>
            </div>

            <div style={styles.statusText}>
              {txMessage || "Ready to interact with VerdeFi."}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 50% 20%, rgba(9,68,62,0.55) 0%, rgba(5,20,18,1) 38%, rgba(2,10,9,1) 100%)",
    color: "#FFFFFF",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    position: "relative",
    overflow: "hidden",
  },

  bgGlowTop: {
    position: "absolute",
    top: -120,
    left: "50%",
    transform: "translateX(-50%)",
    width: 800,
    height: 280,
    background: "rgba(255, 211, 116, 0.08)",
    filter: "blur(70px)",
    borderRadius: "50%",
    pointerEvents: "none",
  },

  bgGlowCenter: {
    position: "absolute",
    top: "35%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 900,
    height: 420,
    background: "rgba(9, 68, 62, 0.16)",
    filter: "blur(90px)",
    borderRadius: "50%",
    pointerEvents: "none",
  },

  shell: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1320,
    margin: "0 auto",
    padding: "28px 28px 56px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },

  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  logo: {
    width: 34,
    height: 34,
    objectFit: "contain",
  },

  brand: {
    fontSize: 36,
    fontWeight: 800,
    lineHeight: 1,
    color: "#FFD374",
    letterSpacing: "0.02em",
  },

  tagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
    marginTop: 8,
  },

  headerButton: {
    background: "rgba(255, 211, 116, 0.15)",
    color: "#FFD374",
    border: "1px solid rgba(255, 211, 116, 0.45)",
    borderRadius: 16,
    padding: "14px 22px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
  },

  walletBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: "8px 12px",
  },

  walletAddress: {
    fontSize: 13,
    fontWeight: 700,
    color: "#FFFFFF",
  },

  disconnectButton: {
    background: "#FFD374",
    color: "#0A1B18",
    border: "none",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },

  main: {
    display: "flex",
    flexDirection: "column",
    gap: 22,
  },

  hero: {
    padding: "12px 4px 10px",
  },

  heroBadge: {
    display: "inline-block",
    fontSize: 14,
    fontWeight: 700,
    color: "#FFD374",
    border: "1px solid rgba(255, 211, 116, 0.35)",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255, 211, 116, 0.08)",
    marginBottom: 16,
  },

  heroTitle: {
    fontSize: 46,
    lineHeight: 1.05,
    fontWeight: 800,
    margin: 0,
    maxWidth: 760,
  },

  heroText: {
    marginTop: 14,
    fontSize: 18,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.78)",
    maxWidth: 720,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 16,
  },

  statCard: {
    background: "rgba(7, 23, 21, 0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 10px 35px rgba(0,0,0,0.22)",
  },

  statLabel: {
    display: "block",
    fontSize: 13,
    color: "rgba(255,255,255,0.58)",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  statValue: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.4,
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },

  infoPanel: {
    background: "rgba(7, 23, 21, 0.78)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 10px 35px rgba(0,0,0,0.20)",
  },

  panelTitle: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 16,
    color: "#FFFFFF",
  },

  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },

  infoKey: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
  },

  infoValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: 700,
    textAlign: "right",
  },

  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 20,
    alignItems: "stretch",
  },

  actionCard: {
    position: "relative",
    minHeight: 350,
    borderRadius: 28,
    padding: 26,
    overflow: "hidden",
    boxShadow: "0 14px 42px rgba(0,0,0,0.28)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },

  cardDeposit: {
    background:
      "linear-gradient(180deg, rgba(10,54,49,0.96) 0%, rgba(8,37,34,0.98) 100%)",
    border: "1px solid rgba(31, 211, 138, 0.28)",
  },

  cardRequest: {
    background:
      "linear-gradient(180deg, rgba(29,25,20,0.96) 0%, rgba(18,16,14,0.98) 100%)",
    border: "1px solid rgba(255,211,116,0.38)",
  },

  cardClaim: {
    background:
      "linear-gradient(180deg, rgba(7,41,47,0.96) 0%, rgba(6,28,33,0.98) 100%)",
    border: "1px solid rgba(53, 193, 235, 0.28)",
  },

  cardAccentGreen: {
    position: "absolute",
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    background: "rgba(31, 211, 138, 0.12)",
    filter: "blur(30px)",
    borderRadius: "50%",
  },

  cardAccentGold: {
    position: "absolute",
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    background: "rgba(255, 211, 116, 0.12)",
    filter: "blur(30px)",
    borderRadius: "50%",
  },

  cardAccentBlue: {
    position: "absolute",
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    background: "rgba(53, 193, 235, 0.12)",
    filter: "blur(30px)",
    borderRadius: "50%",
  },

  cardTop: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    position: "relative",
    zIndex: 1,
  },

  cardIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    fontSize: 26,
    fontWeight: 800,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    flexShrink: 0,
  },

  cardTitle: {
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 800,
    marginBottom: 8,
  },

  cardSubtitle: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.78)",
    maxWidth: 280,
  },

  input: {
    width: "100%",
    marginTop: 24,
    marginBottom: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.20)",
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: 700,
    padding: "18px 18px",
    outline: "none",
    boxSizing: "border-box",
    WebkitAppearance: "none",
    appearance: "none",
  },

  helperText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.68)",
    marginBottom: 16,
  },

  clearButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 12,
  },

  requestIdBox: {
    border: "1px solid rgba(255,211,116,0.25)",
    background: "rgba(255,211,116,0.05)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },

  requestIdLabel: {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.6)",
  },

  requestIdValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#FFD374",
    marginTop: 4,
  },

  requestIdHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 6,
  },

  requestIdEmpty: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },

  switchNetworkButton: {
    marginTop: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#FFD374",
    color: "#0A1B18",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },

  actionButton: {
    width: "100%",
    border: "none",
    borderRadius: 16,
    fontSize: 18,
    fontWeight: 800,
    padding: "18px 18px",
    cursor: "pointer",
  },

  buttonDeposit: {
    background: "linear-gradient(90deg, #16c784 0%, #25d0a3 100%)",
    color: "#061512",
  },

  buttonRequest: {
    background: "linear-gradient(90deg, #d6aa47 0%, #FFD374 100%)",
    color: "#16130d",
  },

  buttonClaim: {
    background: "linear-gradient(90deg, #29a6d8 0%, #39c4f0 100%)",
    color: "#07171d",
  },

  statusWrap: {
    background: "rgba(7, 23, 21, 0.78)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 22,
  },

  statusWrapError: {
    background: "rgba(70, 13, 13, 0.55)",
    border: "1px solid rgba(255, 120, 120, 0.28)",
    borderRadius: 22,
    padding: 22,
  },

  statusHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#FFD374",
  },

  statusTitleMain: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#FFD374",
  },

  statusTitle: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#FFD374",
    marginBottom: 10,
  },

  statusText: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.88)",
    wordBreak: "break-word",
  },
}

export default App