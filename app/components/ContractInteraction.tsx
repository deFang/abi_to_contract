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

  // Recursive result formatter for nested structs/tuples
  const formatResult = (result: unknown, abiOutput: ContractMethodOutput | ContractMethodOutput[]): string => {
    if (result === null || result === undefined) {
      return 'null';
    }

    // If abiOutput is an array, treat as tuple root or top-level output
    if (Array.isArray(abiOutput)) {
      // Handle array-like object (ethers.js result)
      if ((typeof result === 'object' && result !== null && !Array.isArray(result)) || Array.isArray(result)) {
        const resultObj = result as ContractResultObject;
        const formattedValues = abiOutput.map((output: ContractMethodOutput, idx: number) => {
          // Try both numeric and named keys for robustness
          const value = resultObj[idx] ?? resultObj[idx.toString()] ?? resultObj[output.name];
          return `${output.name}: ${formatResult(value, output)}`;
        });
        return `{
  ${formattedValues.join(',\n  ')}
}`;
      }
    }

    // If abiOutput is a tuple
    if (!Array.isArray(abiOutput) && typeof abiOutput === 'object' && abiOutput.type === 'tuple' && abiOutput.components) {
      // Handle both array and object representations of a tuple
      if ((typeof result === 'object' && result !== null) || Array.isArray(result)) {
        const resultObj: Record<string, unknown> | Array<unknown> = result as Record<string, unknown> | Array<unknown>;
        const formattedValues = abiOutput.components.map((comp: ContractMethodOutput, idx: number) => {
          let value: unknown;
          if (Array.isArray(resultObj)) {
            value = resultObj[idx];
          } else {
            value = (resultObj as Record<string, unknown>)[comp.name] ?? (resultObj as Record<string, unknown>)[idx] ?? (resultObj as Record<string, unknown>)[idx.toString()];
          }
          return `${comp.name}: ${formatResult(value, comp)}`;
        });
        return `{
  ${formattedValues.join(',\n  ')}
}`;
      }
      // If it's an array of tuples
      if (Array.isArray(result)) {
        return '[\n' + result.map((item) => formatResult(item, abiOutput.components!)).join(',\n') + '\n]';
      }
    }

    // Handle arrays of primitives
    if (Array.isArray(result)) {
      return '[ ' + result.map((v) => formatResult(v, abiOutput)).join(', ') + ' ]';
    }

    // Handle primitive types
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
        const formattedResult = formatResult(result, method.outputs);
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
    <div className="space-y-4 max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ABI Contract Interaction Tool</h1>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Contract ABI</label>
        <textarea
          value={abi}
          onChange={handleAbiChange}
          className="w-full h-32 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Paste your contract ABI here..."
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Contract Address</label>
        <input
          type="text"
          value={contractAddress}
          onChange={handleContractAddressChange}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="0x..."
        />
      </div>

      <div className="space-y-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {showAdvanced ? '- Hide Advanced Settings' : '+ Show Advanced Settings'}
        </button>

        {showAdvanced && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-md space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Custom RPC URL (Optional)
              </label>
              <input
                type="text"
                value={customRpcUrl}
                onChange={(e) => handleCustomRpcChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter block number..."
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={generateContract}
        className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      >
        Generate Contract
      </button>

      {error && (
        <div className="p-3 text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {methods.length > 0 && (
        <div className="mt-6 space-y-6">
          <h3 className="text-xl font-semibold text-gray-800">Contract Methods</h3>
          {methods.map((method) => (
            <div key={method.name} className="p-4 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <h4 className="text-lg font-medium text-gray-800">{method.name}</h4>
              <div className="mt-2 text-sm text-gray-500">
                {method.stateMutability === 'view' || method.stateMutability === 'pure' 
                  ? '🔍 Read-Only Method'
                  : '✏️ Write Method'}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const args = method.inputs.map((input, idx) => {
                    const inputName = input.name && input.name.length > 0 ? input.name : `arg${idx}`;
                    const value = formData.get(inputName);
                    const strValue = value?.toString() || '';

                    // Handle different input types
                    if (input.type === 'bytes32') {
                      // Handle empty input
                      if (!strValue) {
                        return ethers.ZeroHash;
                      }
                      // If input is already a hex string of correct length, use it
                      if (strValue.startsWith('0x') && strValue.length === 66) {
                        return strValue;
                      }
                      // If input is a shorter hex string, pad it with zeros
                      if (strValue.startsWith('0x')) {
                        const hexValue = strValue.slice(2).padEnd(64, '0');
                        return `0x${hexValue}`;
                      }
                      // If input is not a hex string, convert to bytes32
                      try {
                        return ethers.hexlify(ethers.toUtf8Bytes(strValue)).padEnd(66, '0');
                      } catch {
                        return ethers.ZeroHash;
                      }
                    }
                    if (input.type.startsWith('uint') || input.type.startsWith('int')) {
                      return value ? BigInt(value.toString()) : BigInt(0);
                    }
                    if (input.type === 'bool') {
                      return value === 'true';
                    }
                    if (input.type === 'address') {
                      return strValue || ethers.ZeroAddress;
                    }
                    return strValue;
                  });
                  handleMethodCall(method, ...args);
                }}
                className="mt-4 space-y-3"
              >
                {method.inputs.map((input, idx) => {
                  const inputName = input.name && input.name.length > 0 ? input.name : `arg${idx}`;
                  return (
                    <div key={inputName} className="space-y-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {inputName} <span className="text-gray-500">({input.type})</span>
                      </label>
                      <input
                        type="text"
                        name={inputName}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={input.type === 'bytes32' ? 'Enter hex string (0x...) or value to convert' : `Enter ${input.type}`}
                      />
                    </div>
                  );
                })}
                <button
                  type="submit"
                  className={`px-4 py-2 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                    method.stateMutability === 'view' || method.stateMutability === 'pure'
                      ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                      : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                  }`}
                >
                  {method.stateMutability === 'view' || method.stateMutability === 'pure'
                    ? 'Call'
                    : 'Send Transaction'}
                </button>
              </form>

              {/* Show method-specific results */}
              {results.filter(r => r.methodName === method.name).map((result) => (
                <div key={result.timestamp} 
                     className={`mt-4 p-4 rounded-md border ${
                       result.error 
                         ? 'bg-red-50 border-red-200 text-red-700' 
                         : 'bg-green-50 border-green-200 text-green-700'
                     }`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm opacity-75">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {result.error ? (
                    <div className="text-red-600">{result.result}</div>
                  ) : (
                    <pre className="mt-2 p-3 bg-white border border-gray-100 rounded font-mono text-sm break-all whitespace-pre-wrap overflow-x-auto">
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