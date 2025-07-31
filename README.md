# ArcadzVault

A secure, signature-based ERC20 vault for controlled deposits and withdrawals.

## How the Contract Works

- **Deposits:**
  - Users can deposit ERC20 tokens ("Bonez") into the vault after approving the contract.
  - The vault holds tokens securely and emits a `BonezDeposit` event on deposit.

- **Withdrawals:**
  - Withdrawals require an off-chain signature from a designated signer (set by the owner).
  - Each user has a nonce to prevent replay attacks. The signature must match the amount, nonce, and user address.
  - On successful withdrawal the contract emits `BonezWithdraw` event, the user's nonce is incremented and tokens are transferred out.

- **Admin Functions:**
  - The owner can set the ERC20 token address and the authorized signer.
  - Emergency withdrawal and AVAX withdrawal functions are available for the owner.
  - The contract can be paused/unpaused by the owner to halt deposits/withdrawals.

## Deployment

Deployment is managed via Hardhat Ignition:

- The deployment module (`ignition/modules/ArcadzVault.ts`) deploys a mock ERC20 token and the ArcadzVault contract.
- The signer address can be set via module parameters.
- Example deployment commands:

```sh
npm run deploy:localhost   # Deploy to local Hardhat node
npm run deploy:testnet     # Deploy to Avalanche Fuji testnet
npm run deploy:mainnet     # Deploy to Avalanche Mainnet

npm run deploy:testnet -- --verify # Deploy to testnet with verification
npm run deploy:mainnet -- --verify # Deploy to mainnet with verification
```

## Verification post Deployment

To verify the contract, ensure you have the `ETHERSCAN_API_KEY` set in your `.env` file. Then run:

```sh
npx hardhat verify --network <network> <contractAddress> "<bonezAddress>" "<signerAddress>"
```

Alternatively, you can verify an existing Hardhat Ignition deployment:

```sh
npx hardhat ignition verify chain-43113 # For Avalanche Fuji testnet
npx hardhat ignition verify chain-43114 # For Avalanche Mainnet
```


## Commands

All commands are run from the project root:

| Command                  | Description                                                      |
|-------------------------|------------------------------------------------------------------|
| `npm run test`           | Run the full test suite with Hardhat                             |
| `npm run test:coverage`  | Run tests with Solidity coverage reporting                       |
| `npm run build`          | Compile contracts and generate TypeScript contract bindings       |
| `npm run codegen`        | Generate TypeScript contract bindings using wagmi                |
| `npm run node`           | Start a local Hardhat node                                       |
| `npm run deploy:localhost` | Deploy contracts to local node using Ignition                  |
| `npm run deploy:testnet` | Deploy contracts to Avalanche Fuji testnet using Ignition         |
| `npm run deploy:mainnet` | Deploy contracts to Avalanche Mainnet using Ignition             |
| `npm run generate-signature` | Generate a valid withdraw signature for testing/usage         |

### Signature Generation

To generate a withdraw signature (for testing or frontend usage):

```sh
npx hardhat generate-signature --vault <vaultAddress> --amount <amount> --nonce <nonce> --user <userAddress> --deadline <deadline>
```

Requires a `PRIVATE_KEY` and `SIGNER_ADDRESS` in `.env` file (used as the authorized signer).

## Project Structure

- `contracts/ArcadzVault.sol` — Main vault contract
- `contracts/test/MockERC20.sol` — Mock ERC20 token for testing
- `ignition/modules/ArcadzVault.ts` — Deployment module
- `test/ArcadzVault.test.ts` — Full test suite
- `tasks/generateSignature.ts` — Hardhat task for signature generation
- `src/generated.ts` — TypeScript contract bindings (auto-generated)
