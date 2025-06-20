import { task } from "hardhat/config";
import { keccak256, encodeAbiParameters, parseAbiParameters, getAddress, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

task("generate-signature", "Generates a withdraw signature")
  .addParam("vault", "The vault address")
  .addParam("amount", "The amount to withdraw (uint256 string)")
  .addParam("nonce", "The nonce value (uint256 string)")
  .addParam("user", "The user address")
  .setAction(async ({ vault, amount, nonce, user }) => {
    const privateKey = process.env.PRIVATE_KEY as `0x${string}` || "";
    if (!privateKey) {
      console.error("Please set the PRIVATE_KEY environment variable.");
      process.exit(1);
    }

    // Validate and checksum addresses with type assertion
    const vaultAddress = getAddress(vault) as `0x${string}`;
    const userAddress = getAddress(user) as `0x${string}`;

    const account = privateKeyToAccount(privateKey);
    const signerWallet = createWalletClient({
      account,
      chain: mainnet,
      transport: http(),
    });

    const getMessageHash = async (
      vaultAddr: `0x${string}`,
      amountBn: bigint,
      nonceBn: bigint,
      userAddr: `0x${string}`
    ) => {
      const encoded = encodeAbiParameters(
        parseAbiParameters("address, uint256, uint256, address"),
        [vaultAddr, amountBn, nonceBn, userAddr]
      );
      return keccak256(encoded);
    };

    const createWithdrawSignature = async (
      vaultAddr: `0x${string}`,
      amountBn: bigint,
      nonceBn: bigint,
      userAddr: `0x${string}`
    ) => {
      const messageHash = await getMessageHash(vaultAddr, amountBn, nonceBn, userAddr);
      return signerWallet.signMessage({
        account: signerWallet.account,
        message: { raw: messageHash },
      });
    };

    const amountBn = BigInt(amount);
    const nonceBn = BigInt(nonce);

    const signature = await createWithdrawSignature(vaultAddress, amountBn, nonceBn, userAddress);

    // Nicely formatted output
    console.log("\n=== Withdraw Signature Generated ===");
    console.log(`Vault Address : ${vaultAddress}`);
    console.log(`User Address  : ${userAddress}`);
    console.log(`Amount        : ${amountBn.toString()}`);
    console.log(`Nonce         : ${nonceBn.toString()}`);
    console.log(`Signature     : ${signature}`);
    console.log("====================================\n");
  });
