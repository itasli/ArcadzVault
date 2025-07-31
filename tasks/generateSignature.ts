import { task } from "hardhat/config";
import { getAddress, createWalletClient, http, isAddress, type Address, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import * as dotenv from "dotenv";
dotenv.config();

task("generate-signature", "Generates a withdraw signature using EIP-712")
  .addParam("vault", "The vault address")
  .addParam("amount", "The amount to withdraw (uint256 string)")
  .addParam("nonce", "The nonce value (uint256 string)")
  .addParam("user", "The user address")
  .addParam("deadline", "The deadline timestamp (uint256 string)")
  .addOptionalParam("networkName", "Network to use (default: mainnet)", "mainnet")
  .addOptionalParam("chainid", "Chain ID (default: 43114 for Avalanche)", "43114")
  .setAction(async ({ vault, amount, nonce, user, deadline, networkName, chainid }, hre) => {
    try {
      // Validate environment
      const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
      if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable is required");
      }

      if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        throw new Error("PRIVATE_KEY must be a valid 32-byte hex string starting with 0x");
      }

      // Validate inputs
      if (!isAddress(vault)) {
        throw new Error(`Invalid vault address: ${vault}`);
      }
      if (!isAddress(user)) {
        throw new Error(`Invalid user address: ${user}`);
      }

      // Parse and validate numeric inputs
      let amountBn: bigint;
      let nonceBn: bigint;
      let deadlineBn: bigint;
      let chainIdNum: number;
      
      try {
        amountBn = BigInt(amount);
        if (amountBn < 0n) {
          throw new Error("Amount cannot be negative");
        }
      } catch (error) {
        throw new Error(`Invalid amount: ${amount}. Must be a valid uint256 string`);
      }

      try {
        nonceBn = BigInt(nonce);
        if (nonceBn < 0n) {
          throw new Error("Nonce cannot be negative");
        }
      } catch (error) {
        throw new Error(`Invalid nonce: ${nonce}. Must be a valid uint256 string`);
      }

      try {
        deadlineBn = BigInt(deadline);
        if (deadlineBn < 0n) {
          throw new Error("Deadline cannot be negative");
        }
      } catch (error) {
        throw new Error(`Invalid deadline: ${deadline}. Must be a valid uint256 string`);
      }

      try {
        chainIdNum = parseInt(chainid);
        if (chainIdNum <= 0) {
          throw new Error("Chain ID must be a positive number");
        }
      } catch (error) {
        throw new Error(`Invalid chainId: ${chainid}. Must be a valid positive integer`);
      }

      // Validate and checksum addresses
      const vaultAddress = getAddress(vault) as `0x${string}`;
      const userAddress = getAddress(user) as `0x${string}`;

      // Setup wallet client
      const account = privateKeyToAccount(privateKey);
      const signerWallet = createWalletClient({
        account,
        chain: mainnet, // Could be made configurable based on network param
        transport: http(),
      });

      // Helper function to create withdrawal signatures using EIP-712
      const createWithdrawSignature = async (
        signerWallet: WalletClient,
        vaultAddress: Address,
        amount: bigint,
        nonce: bigint,
        deadline: bigint,
        userAddress: Address,
        chainId: number
      ): Promise<`0x${string}`> => {
        // EIP-712 domain
        const domain = {
          name: 'ArcadzVault',
          version: '1',
          chainId: chainId,
          verifyingContract: vaultAddress,
        } as const;

        // EIP-712 types
        const types = {
          Withdraw: [
            { name: 'vault', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'userAddress', type: 'address' },
            { name: 'deadline', type: 'uint256' },
          ],
        } as const;

        // Message to sign
        const message = {
          vault: vaultAddress,
          amount: amount,
          nonce: nonce,
          userAddress: userAddress,
          deadline: deadline,
        } as const;

        console.log(`\n🔍 Debug Info:`);
        console.log(`Domain: ${JSON.stringify(domain, null, 2)}`);
        console.log(`Message: ${JSON.stringify(message, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value, 2)}`);
        console.log(`Signer Address: ${signerWallet.account?.address}`);

        // Sign using EIP-712
        return signerWallet.signTypedData({
          account: signerWallet.account!,
          domain,
          types,
          primaryType: 'Withdraw',
          message,
        });
      };

      // Generate signature
      const signature = await createWithdrawSignature(
        signerWallet, 
        vaultAddress, 
        amountBn, 
        nonceBn, 
        deadlineBn, 
        userAddress, 
        chainIdNum
      );

      // Formatted output
      console.log("\n" + "=".repeat(50));
      console.log("🔐 EIP-712 WITHDRAW SIGNATURE GENERATED");
      console.log("=".repeat(50));
      console.log(`📍 Vault Address  : ${vaultAddress}`);
      console.log(`👤 User Address   : ${userAddress}`);
      console.log(`💰 Amount         : ${amountBn.toString()}`);
      console.log(`🔢 Nonce          : ${nonceBn.toString()}`);
      console.log(`⏰ Deadline       : ${deadlineBn.toString()}`);
      console.log(`🔗 Chain ID       : ${chainIdNum}`);
      console.log(`✍️  Signature      : ${signature}`);
      console.log(`🌐 Network        : ${networkName}`);
      console.log(`👨‍💼 Signer       : ${account.address}`);
      console.log("=".repeat(50) + "\n");

      // Optional: Return data for potential use in scripts
      return {
        vault: vaultAddress,
        user: userAddress,
        amount: amountBn.toString(),
        nonce: nonceBn.toString(),
        deadline: deadlineBn.toString(),
        chainId: chainIdNum,
        signature,
        signer: account.address,
      };

    } catch (error) {
      console.error("\n❌ Error generating signature:");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });