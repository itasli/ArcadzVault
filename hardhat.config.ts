import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import 'solidity-coverage'
import * as dotenv from "dotenv";

import "./tasks/generateSignature";


dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version : "0.8.30",
    settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        viaIR: false,
      },
  },
  networks: {
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [process.env.PRIVATE_KEY!],
    },
    mainnet: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: [process.env.PRIVATE_KEY!],
    }
  },
  gasReporter: {
    enabled: true,
    excludeContracts : ["/test"],
    L1: "avalanche",
  },
  sourcify: {
    enabled: true
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "fuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://testnet.snowtrace.io"
        }
      }
    ]
  },
};

export default config;
