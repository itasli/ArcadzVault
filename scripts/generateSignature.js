const {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  getAddress,
  createWalletClient,
  http,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

// Load private key
const privateKey = process.env.PRIVATE_KEY || '';
if (!privateKey) {
  console.error('Please set the PRIVATE_KEY environment variable.');
  process.exit(1);
}

// Create signer wallet client
const account = privateKeyToAccount(privateKey);
const signerWallet = createWalletClient({
  account,
  chain: mainnet,
  transport: http(), // Not actually used for sending txs
});

// Helper to get message hash
async function getMessageHash(vaultAddress, amount, nonce, userAddress) {
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, uint256, uint256, address'),
    [
      getAddress(vaultAddress),
      amount,
      nonce,
      getAddress(userAddress),
    ]
  );

  return keccak256(encoded);
}

// Helper to create signature
async function createWithdrawSignature(signerWallet, vaultAddress, amount, nonce, userAddress) {
  const messageHash = await getMessageHash(vaultAddress, amount, nonce, userAddress);
  return signerWallet.signMessage({
    account: signerWallet.account,
    message: { raw: messageHash },
  });
}

// CLI entry point
async function main() {
  const [vault, amountStr, nonceStr, user] = process.argv.slice(2);
  if (!vault || !amountStr || !nonceStr || !user) {
    console.error('Usage: node scripts/generateSignature.js <vault> <amount> <nonce> <user>');
    process.exit(1);
  }

  const amount = BigInt(amountStr);
  const nonce = BigInt(nonceStr);

  const signature = await createWithdrawSignature(
    signerWallet,
    vault,
    amount,
    nonce,
    user
  );

  console.log('Signature:', signature);
}

main().catch((err) => {
  console.error('Error generating signature:', err);
  process.exit(1);
});
