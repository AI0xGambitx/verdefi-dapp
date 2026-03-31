import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
} from 'wagmi'

function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-semibold mb-8">VerdeFi DApp</h1>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <p className="text-lg">
            Estado: {isConnected ? 'Conectado' : 'Desconectado'}
          </p>

          <p className="break-all">
            Wallet: {address || 'Sin conectar'}
          </p>

          <p>
            Chain ID: {chainId || 'No detectada'}
          </p>

          {!isConnected ? (
            <button
              onClick={() => connect({ connector: connectors[0] })}
              className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black hover:opacity-90"
            >
              Conectar MetaMask
            </button>
          ) : (
            <button
              onClick={() => disconnect()}
              className="rounded-xl bg-red-500 px-4 py-2 font-medium text-white hover:opacity-90"
            >
              Desconectar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default App