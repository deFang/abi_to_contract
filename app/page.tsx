'use client';

import WalletConnect from './components/WalletConnect';
import ContractInteraction from './components/ContractInteraction';
import { WalletProvider } from './context/WalletContext';

export default function Home() {
  return (
    <WalletProvider>
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-3xl font-bold text-center">ABI Contract Interaction Tool</h1>
          <WalletConnect />
          <ContractInteraction />
        </div>
      </main>
    </WalletProvider>
  );
}
