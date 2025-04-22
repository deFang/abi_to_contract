import { useWallet } from '../context/WalletContext';

export default function WalletConnect() {
  const { address, connectWallet, disconnectWallet, isConnected, chainId } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex items-center space-x-4 p-4 bg-gray-100 rounded-lg">
      {isConnected ? (
        <>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Connected:</span>
            <span className="text-sm">{formatAddress(address!)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Chain ID:</span>
            <span className="text-sm">{chainId}</span>
          </div>
          <button
            onClick={disconnectWallet}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          onClick={connectWallet}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600"
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
} 