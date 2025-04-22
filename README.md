# ABI Contract Interaction Tool

A web-based tool for interacting with smart contracts using ABI and MetaMask wallet.

## Features

- Connect to MetaMask wallet
- Import contract ABI
- Generate contract instance
- Interact with contract methods (read/write)
- Support for various parameter types
- Transaction status feedback

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- MetaMask browser extension
- Modern web browser

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd abi-contract-interaction
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. Connect your MetaMask wallet by clicking the "Connect Wallet" button
2. Paste your contract ABI in the text area
3. Enter the contract address
4. Click "Generate Contract" to create the contract instance
5. Interact with contract methods:
   - For read methods (view/pure), click "Call"
   - For write methods (nonpayable/payable), click "Send Transaction"

## Development

The project is built with:

- Next.js
- TypeScript
- Tailwind CSS
- ethers.js
- MetaMask SDK

## License

MIT
