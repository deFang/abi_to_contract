'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../context/WalletContext';

interface ContractMethod {
  name: string;
  inputs: { name: string; type: string }[];
  stateMutability: string;
  type: string;
}

interface AbiItem {
  type: string;
  name?: string;
  inputs?: { name: string; type: string }[];
  stateMutability?: string;
}

export default function ContractInteraction() {
  const { signer } = useWallet();
  const [abi, setAbi] = useState<string>('');
  const [contractAddress, setContractAddress] = useState<string>('');
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [methods, setMethods] = useState<ContractMethod[]>([]);
  const [error, setError] = useState<string>('');

  const handleAbiChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAbi(event.target.value);
  };

  const handleContractAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setContractAddress(event.target.value);
  };

  const generateContract = async () => {
    try {
      if (!signer) {
        throw new Error('Please connect your wallet first');
      }

      if (!abi || !contractAddress) {
        throw new Error('Please provide both ABI and contract address');
      }

      let parsedAbi: AbiItem[];
      try {
        parsedAbi = JSON.parse(abi);
      } catch {
        throw new Error('Invalid ABI format');
      }

      const contract = new ethers.Contract(contractAddress, parsedAbi, signer);
      setContract(contract);

      // Filter and sort methods
      const contractMethods = parsedAbi
        .filter((item: AbiItem): item is ContractMethod => 
          item.type === 'function' && 
          typeof item.name === 'string' && 
          Array.isArray(item.inputs) &&
          typeof item.stateMutability === 'string'
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      setMethods(contractMethods);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setContract(null);
      setMethods([]);
    }
  };

  const handleMethodCall = async (method: ContractMethod, formData: FormData) => {
    if (!contract) return;

    try {
      const args = method.inputs.map((input) => {
        const value = formData.get(input.name);
        // Convert string values to appropriate types
        if (input.type === 'uint256' || input.type === 'uint') {
          return BigInt(value as string);
        }
        return value;
      });

      const result = await contract[method.name](...args);
      console.log('Method call result:', result);
    } catch (err) {
      console.error('Error calling method:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Contract ABI</label>
        <textarea
          value={abi}
          onChange={handleAbiChange}
          className="w-full h-32 p-2 border rounded-md"
          placeholder="Paste your contract ABI here..."
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Contract Address</label>
        <input
          type="text"
          value={contractAddress}
          onChange={handleContractAddressChange}
          className="w-full p-2 border rounded-md"
          placeholder="0x..."
        />
      </div>

      <button
        onClick={generateContract}
        className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600"
      >
        Generate Contract
      </button>

      {error && <div className="p-2 text-red-500 bg-red-100 rounded-md">{error}</div>}

      {methods.length > 0 && (
        <div className="mt-4 space-y-4">
          <h3 className="text-lg font-medium">Contract Methods</h3>
          {methods.map((method) => (
            <div key={method.name} className="p-4 border rounded-md">
              <h4 className="font-medium">{method.name}</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleMethodCall(method, new FormData(e.currentTarget));
                }}
                className="mt-2 space-y-2"
              >
                {method.inputs.map((input) => (
                  <div key={input.name} className="space-y-1">
                    <label className="block text-sm text-gray-600">
                      {input.name} ({input.type})
                    </label>
                    <input
                      type="text"
                      name={input.name}
                      className="w-full p-2 border rounded-md"
                      placeholder={`Enter ${input.type}`}
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-green-500 rounded-md hover:bg-green-600"
                >
                  {method.stateMutability === 'view' || method.stateMutability === 'pure'
                    ? 'Call'
                    : 'Send Transaction'}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 