import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ethers } from 'ethers';
import detectEthereumProvider from '@metamask/detect-provider';
import type { MetaMaskInpageProvider } from '@metamask/providers';

interface WalletContextType {
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  address: string | null;
  chainId: number | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnected: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

type EthereumWindow = Window & {
  ethereum?: MetaMaskInpageProvider;
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check if wallet is already connected
    const checkConnection = async () => {
      const ethereum = (await detectEthereumProvider()) as MetaMaskInpageProvider | null;
      if (ethereum) {
        const ethProvider = new ethers.BrowserProvider(ethereum);
        const accounts = await ethProvider.listAccounts();
        if (accounts.length > 0) {
          const newSigner = await ethProvider.getSigner();
          const network = await ethProvider.getNetwork();
          setProvider(ethProvider);
          setSigner(newSigner);
          setAddress(accounts[0].address);
          setChainId(Number(network.chainId));
          setIsConnected(true);
        }
      }
    };

    checkConnection();

    // Listen for account changes
    const handleAccountsChanged = (accounts: unknown) => {
      const accountsArray = accounts as string[];
      if (!Array.isArray(accountsArray) || accountsArray.length === 0) {
        disconnectWallet();
      } else {
        setAddress(accountsArray[0]);
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      if (typeof chainId === 'string') {
        setChainId(Number(chainId));
      }
    };

    const ethereum = (window as EthereumWindow).ethereum;
    if (ethereum) {
      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const connectWallet = async () => {
    try {
      const ethereum = (await detectEthereumProvider()) as MetaMaskInpageProvider | null;
      if (!ethereum) {
        throw new Error('Please install MetaMask!');
      }

      const ethProvider = new ethers.BrowserProvider(ethereum);
      const accounts = await ethProvider.send('eth_requestAccounts', []);
      const newSigner = await ethProvider.getSigner();
      const network = await ethProvider.getNetwork();

      setProvider(ethProvider);
      setSigner(newSigner);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
      setIsConnected(true);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setIsConnected(false);
  };

  return (
    <WalletContext.Provider
      value={{
        provider,
        signer,
        address,
        chainId,
        connectWallet,
        disconnectWallet,
        isConnected,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
} 