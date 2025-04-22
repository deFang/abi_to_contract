'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../context/WalletContext';

interface ContractMethodOutput {
  name: string;
  type: string;
  components?: ContractMethodOutput[];
}

interface ContractMethod {
  name: string;
  inputs: { name: string; type: string }[];
  outputs: ContractMethodOutput[];
  stateMutability: string;
  type: string;
}

interface AbiItem {
  type: string;
  name?: string;
  inputs?: { name: string; type: string }[];
  outputs?: { name: string; type: string }[];
  stateMutability?: string;
}

// Add new type for contract result object
interface ContractResultObject {
  [key: string]: string | number | boolean | bigint | ContractResultObject | Array<unknown>;
}

interface MethodResult {
  methodName: string;
  timestamp: string;
  result: string;
  error: boolean;
}

export default function ContractInteraction() {
  const { signer } = useWallet();
  const [abi, setAbi] = useState<string>('');
  const [contractAddress, setContractAddress] = useState<string>('');
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [methods, setMethods] = useState<ContractMethod[]>([]);
  const [error, setError] = useState<string>('');
  const [results, setResults] = useState<MethodResult[]>([]);
  
  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRpcUrl, setCustomRpcUrl] = useState('');
  const [blockNumber, setBlockNumber] = useState('');
  const [provider, setProvider] = useState<ethers.Provider | null>(null);

  const handleAbiChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAbi(event.target.value);
  };

  const handleContractAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setContractAddress(event.target.value);
  };

  const handleCustomRpcChange = async (url: string) => {
    setCustomRpcUrl(url);
    if (url) {
      try {
        const newProvider = new ethers.JsonRpcProvider(url);
        await newProvider.getBlockNumber(); // Test the connection
        setProvider(newProvider);
        setError('');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed';
        setError(`Invalid RPC URL or ${errorMessage}`);
        setProvider(null);
      }
    } else {
      setProvider(null);
    }
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

      // Use custom provider if available, otherwise use signer's provider
      const contractProvider = provider || signer;
      const contract = new ethers.Contract(contractAddress, parsedAbi, contractProvider);
      setContract(contract);

      // Filter and sort methods
      const contractMethods = parsedAbi
        .filter((item: AbiItem): item is ContractMethod => 
          item.type === 'function' && 
          typeof item.name === 'string' && 
          Array.isArray(item.inputs) &&
          Array.isArray(item.outputs) &&
          typeof item.stateMutability === 'string'
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      setMethods(contractMethods);
      setError('');
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setContract(null);
      setMethods([]);
    }
  };

  // Define input types for contract methods
  type MethodInputValue = string | number | boolean | bigint;

  const formatResult = (result: unknown, method: ContractMethod): string => {
    if (result === null || result === undefined) {
      return 'null';
    }

    // Handle array-like results (including tuples)
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const resultObj = result as ContractResultObject;
      
      // Check if it's a numeric-keyed object (like [0,1,2] but as an object)
      const keys = Object.keys(resultObj);
      const isNumericKeys = keys.every(key => !isNaN(Number(key)));
      
      if (isNumericKeys) {
        // Create an array of formatted values using the method outputs
        const formattedValues = method.outputs.map((output, index) => {
          const value = resultObj[index.toString()];
          const name = output.name.replace(/^_/, ''); // Remove leading underscore
          
          let formattedValue: string;
          if (typeof value === 'bigint') {
            formattedValue = value.toString();
          } else if (typeof value === 'string' && value.startsWith('0x')) {
            formattedValue = value;
          } else if (typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)))) {
            formattedValue = BigInt(value.toString()).toString();
          } else {
            formattedValue = String(value);
          }
          
          return `${name}: ${formattedValue}`;
        });
        
        return `{\n  ${formattedValues.join(',\n  ')}\n}`;
      }
    }

    // Handle arrays
    if (Array.isArray(result)) {
      const formattedValues = result.map((value, index) => {
        const name = method.outputs[index]?.name?.replace(/^_/, '') || `output${index}`;
        return `${name}: ${formatResult(value, method)}`;
      });
      return `{\n  ${formattedValues.join(',\n  ')}\n}`;
    }

    // Handle single values
    if (typeof result === 'bigint') {
      return result.toString();
    }
    if (typeof result === 'string' && result.startsWith('0x')) {
      return result;
    }
    if (typeof result === 'number' || (typeof result === 'string' && !isNaN(Number(result)))) {
      return BigInt(result).toString();
    }
    
    return String(result);
  };

  const handleMethodCall = async (method: ContractMethod, ...args: MethodInputValue[]) => {
    if (!contract) return;

    try {
      let result;
      if (method.stateMutability === 'view' || method.stateMutability === 'pure') {
        // For view/pure calls, use block number if specified
        const methodFn = contract.getFunction(method.name);
        if (blockNumber && !isNaN(Number(blockNumber))) {
          result = await methodFn.staticCall(...args, { blockTag: Number(blockNumber) });
        } else {
          result = await methodFn(...args);
        }
      } else {
        // For non-view methods, always use signer
        const contractWithSigner = contract.connect(signer);
        const methodFn = contractWithSigner.getFunction(method.name);
        result = await methodFn(...args);
      }

      console.log('Raw result:', result);
      
      // Handle transaction result differently from view/pure call result
      if (method.stateMutability !== 'view' && method.stateMutability !== 'pure') {
        // For transactions, wait for the transaction to be mined
        const tx = result; // This is a TransactionResponse
        const newResult: MethodResult = {
          methodName: method.name,
          timestamp: new Date().toISOString(),
          result: `Transaction sent!\nTransaction Hash: ${tx.hash}\nWaiting for confirmation...`,
          error: false
        };
        setResults(prev => [newResult, ...prev].slice(0, 10));
        
        // Wait for transaction to be mined
        const receipt = await tx.wait();
        const updatedResult: MethodResult = {
          methodName: method.name,
          timestamp: new Date().toISOString(),
          result: `Transaction confirmed!\nTransaction Hash: ${receipt.hash}\nBlock Number: ${receipt.blockNumber}\nGas Used: ${receipt.gasUsed.toString()}`,
          error: false
        };
        setResults(prev => [updatedResult, ...prev.slice(1)]);
      } else {
        // For view/pure calls, format the result as before
        const formattedResult = formatResult(result, method);
        console.log('Formatted result:', formattedResult);
        const newResult: MethodResult = {
          methodName: method.name,
          timestamp: new Date().toISOString(),
          result: `${blockNumber ? `[Block ${blockNumber}]\n` : ''}${formattedResult}`,
          error: false
        };
        setResults(prev => [newResult, ...prev].slice(0, 10));
      }
    } catch (error) {
      console.error('Error calling method:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const newResult: MethodResult = {
        methodName: method.name,
        timestamp: new Date().toISOString(),
        result: errorMessage,
        error: true
      };
      setResults(prev => [newResult, ...prev].slice(0, 10));
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

      <div className="space-y-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          {showAdvanced ? '- Hide Advanced Settings' : '+ Show Advanced Settings'}
        </button>

        {showAdvanced && (
          <div className="p-4 bg-gray-50 rounded-md space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Custom RPC URL (Optional)
              </label>
              <input
                type="text"
                value={customRpcUrl}
                onChange={(e) => handleCustomRpcChange(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Block Number (Optional, for view/pure calls)
              </label>
              <input
                type="text"
                value={blockNumber}
                onChange={(e) => setBlockNumber(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Enter block number..."
              />
            </div>
          </div>
        )}
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
                  const formData = new FormData(e.currentTarget);
                  const args = method.inputs.map(input => {
                    const value = formData.get(input.name);
                    // Convert form values based on input type
                    if (input.type.startsWith('uint') || input.type.startsWith('int')) {
                      return value ? BigInt(value.toString()) : BigInt(0);
                    }
                    if (input.type === 'bool') {
                      return value === 'true';
                    }
                    return value?.toString() || '';
                  });
                  handleMethodCall(method, ...args);
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

              {/* Show method-specific results */}
              {results.filter(r => r.methodName === method.name).map((result) => (
                <div key={result.timestamp} 
                     className={`mt-4 p-3 rounded-md ${result.error ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {result.error ? (
                    <div className="text-red-600 mt-1">{result.result}</div>
                  ) : (
                    <pre className="mt-1 font-mono text-sm break-all whitespace-pre-wrap overflow-x-auto">
                      {result.result}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}