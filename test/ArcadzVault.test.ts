import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, formatEther, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import type { WalletClient, Address } from 'viem';

describe("ArcadzVault", function () {
  async function deployFixture() {
    const [owner, signer, user1, user2, ...otherAccounts] = await hre.viem.getWalletClients();

    const publicClient = await hre.viem.getPublicClient();

    const chainId = hre.network.config.chainId!;

    const deadline = BigInt(Date.now()) + 60n * 1000n; // now + 1 minute

    // Deploy mock ERC20 token
    const mockToken = await hre.viem.deployContract("MockERC20", [
      "Bonez Token",
      "BONEZ", 
      parseEther("1000000")
    ]);

    // Deploy ArcadzVault
    const arcadzVault = await hre.viem.deployContract("ArcadzVault", [
      mockToken.address,
      signer.account.address
    ]);

    // Transfer some tokens to users for testing
    await mockToken.write.transfer([user1.account.address, parseEther("1000")]);
    await mockToken.write.transfer([user2.account.address, parseEther("1000")]);

    return {
      arcadzVault,
      mockToken,
      chainId,
      owner,
      signer,
      user1,
      user2,
      publicClient,
      otherAccounts,
      deadline
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { arcadzVault, owner } = await loadFixture(deployFixture);
      
      expect(await arcadzVault.read.owner()).to.equal(getAddress(owner.account.address));
    });

    it("Should set the right bonez contract", async function () {
      const { arcadzVault, mockToken } = await loadFixture(deployFixture);
      
      expect(await arcadzVault.read.bonezContract()).to.equal(getAddress(mockToken.address));
    });

    it("Should set the right signer", async function () {
      const { arcadzVault, signer, user1, deadline, chainId } = await loadFixture(deployFixture);

      const amount = parseEther("50");
      const nonce = 0n;

      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);
      
      expect(await arcadzVault.read.verify([amount, nonce, deadline, user1.account.address, signature])).to.be.true;
    });
  });

  describe("Deposit", function () {
    it("Should allow users to deposit tokens", async function () {
      const { arcadzVault, mockToken, user1, publicClient } = await loadFixture(deployFixture);
      
      const depositAmount = parseEther("100");
      
      // Approve tokens
      await mockToken.write.approve([arcadzVault.address, depositAmount], { account: user1.account });
      
      // Deposit tokens
      const hash = await arcadzVault.write.deposit([depositAmount], { account: user1.account });
      
      // Wait for transaction and get receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      // Check event was emitted
      const depositEvents = await arcadzVault.getEvents.BonezDeposit();
      expect(depositEvents).to.have.lengthOf(1);
      expect(depositEvents[0].args.user).to.equal(getAddress(user1.account.address));
      expect(depositEvents[0].args.amount).to.equal(depositAmount);

      // Check vault balance
      const vaultBalance = await mockToken.read.balanceOf([arcadzVault.address]);
      expect(vaultBalance).to.equal(depositAmount);
    });

    it("Should revert when deposit amount is zero", async function () {
      const { arcadzVault, user1 } = await loadFixture(deployFixture);
      
      await expect(
        arcadzVault.write.deposit([0n], { account: user1.account })
      ).to.be.rejectedWith("ZeroAmount");
    });

    it("Should revert when trying to set bonez to zero address", async function () {
      const { arcadzVault } = await loadFixture(deployFixture);

      await expect(
        arcadzVault.write.setBonez(["0x0000000000000000000000000000000000000000"])
      ).to.be.rejectedWith("ZeroAddress");
    });

    it("Should revert when user has insufficient balance", async function () {
      const { arcadzVault, mockToken, user1 } = await loadFixture(deployFixture);
      
      const largeAmount = parseEther("10000");
      await mockToken.write.approve([arcadzVault.address, largeAmount], { account: user1.account });
      
      await expect(
        arcadzVault.write.deposit([largeAmount], { account: user1.account })
      ).to.be.rejected;
    });

    it("Should revert when user hasn't approved tokens", async function () {
      const { arcadzVault, user1 } = await loadFixture(deployFixture);
      
      await expect(
        arcadzVault.write.deposit([parseEther("100")], { account: user1.account })
      ).to.be.rejected;
    });
  });

  describe("Withdraw", function () {
    async function depositFixture() {
      const fixtureData = await deployFixture();
      const { arcadzVault, mockToken, user1 } = fixtureData;
      
      const depositAmount = parseEther("100");
      await mockToken.write.approve([arcadzVault.address, depositAmount], { account: user1.account });
      await arcadzVault.write.deposit([depositAmount], { account: user1.account });
      
      return { ...fixtureData, depositAmount };
    }

    it("Should allow users to withdraw tokens with valid signature", async function () {
      const { arcadzVault, mockToken, chainId, signer, user1, publicClient, deadline } = await loadFixture(depositFixture);

      const amount = parseEther("50");
      const nonce = 0n;
      //const deadline = BigInt(Date.now()) + 60n * 1000n; // now + 1 minute
      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      const initialBalance = await mockToken.read.balanceOf([user1.account.address]);

      const hash = await arcadzVault.write.withdraw([amount, nonce, deadline, signature], { account: user1.account });
      await publicClient.waitForTransactionReceipt({ hash });

      // Check event was emitted
      const withdrawEvents = await arcadzVault.getEvents.BonezWithdraw();
      expect(withdrawEvents).to.have.lengthOf(1);
      expect(withdrawEvents[0].args.user).to.equal(getAddress(user1.account.address));
      expect(withdrawEvents[0].args.amount).to.equal(amount);
      expect(withdrawEvents[0].args.nonce).to.equal(nonce);

      // Check user balance increased
      const finalBalance = await mockToken.read.balanceOf([user1.account.address]);
      expect(finalBalance).to.equal(initialBalance + amount);
      
      // Check vault balance decreased
      const vaultBalance = await mockToken.read.balanceOf([arcadzVault.address]);
      expect(vaultBalance).to.equal(parseEther("50")); // 100 - 50
      
      // Check nonce incremented
      const userNonce = await arcadzVault.read.nonceByAddress([user1.account.address]);
      expect(userNonce).to.equal(1n);
    });

    it("Should revert when withdraw amount is zero", async function () {
      const { arcadzVault, chainId, signer, user1, deadline } = await loadFixture(depositFixture);

      const amount = 0n;
      const nonce = 0n;

      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      await expect(
        arcadzVault.write.withdraw([amount, nonce, deadline, signature], { account: user1.account })
      ).to.be.rejectedWith("ZeroAmount");
    });

    it("Should revert with invalid signature", async function () {
      const { arcadzVault, chainId, user1, user2, deadline } = await loadFixture(depositFixture);

      const amount = parseEther("50");
      const nonce = 0n;
      //const deadline = BigInt(Date.now()) + 60n * 1000n; // now + 1 minute
      // Create signature with wrong signer
      const wrongSignature = await createWithdrawSignature(user2, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      await expect(
        arcadzVault.write.withdraw([amount, nonce, deadline, wrongSignature], { account: user1.account })
      ).to.be.rejectedWith("InvalidSignature");
    });

    it("Should revert with invalid nonce", async function () {
      const { arcadzVault, chainId, signer, user1, deadline } = await loadFixture(depositFixture);
      
      const amount = parseEther("50");
      const wrongNonce = 5n; // User's current nonce is 0

      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, wrongNonce, deadline, user1.account.address, chainId);

      await expect(
        arcadzVault.write.withdraw([amount, wrongNonce, deadline, signature], { account: user1.account })
      ).to.be.rejectedWith("InvalidNonce");
    });

    it("Should revert with expired deadline", async function () {
      const { arcadzVault, chainId, signer, user1 } = await loadFixture(depositFixture);

      const amount = parseEther("50");
      const nonce = 0n;
      const pastDeadline = 0n

      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, pastDeadline, user1.account.address, chainId);
      
      await expect(
        arcadzVault.write.withdraw([amount, nonce, pastDeadline, signature], { account: user1.account })
      ).to.be.rejectedWith("SignatureExpired");
    });

    it("Should revert when trying to reuse nonce", async function () {
      const { arcadzVault, signer, user1, publicClient, chainId, deadline } = await loadFixture(depositFixture);
      
      const amount = parseEther("25");
      const nonce = 0n;
      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      // First withdrawal should succeed
      const hash = await arcadzVault.write.withdraw([amount, nonce, deadline, signature], { account: user1.account });
      await publicClient.waitForTransactionReceipt({ hash });

      // Second withdrawal with same nonce should fail
      await expect(
        arcadzVault.write.withdraw([amount, nonce, deadline, signature], { account: user1.account })
      ).to.be.rejectedWith("InvalidNonce");
    });

    it("Should revert when contract has insufficient balance", async function () {
      const { arcadzVault, signer, user1, deadline, chainId } = await loadFixture(depositFixture);

      const largeAmount = parseEther("200"); // More than deposited
      const nonce = 0n;
      const signature = await createWithdrawSignature(signer, arcadzVault.address, largeAmount, nonce, deadline, user1.account.address, chainId);

      await expect(
        arcadzVault.write.withdraw([largeAmount, nonce, deadline, signature], { account: user1.account })
      ).to.be.rejectedWith("InsufficientContractBalance");
    });

    it("Should handle multiple sequential withdrawals", async function () {
      const { arcadzVault, mockToken, signer, user1, publicClient, chainId, deadline } = await loadFixture(depositFixture);

      const amount1 = parseEther("30");
      const amount2 = parseEther("20");

      // First withdrawal
      const signature1 = await createWithdrawSignature(signer, arcadzVault.address, amount1, 0n, deadline, user1.account.address, chainId);
      const hash1 = await arcadzVault.write.withdraw([amount1, 0n, deadline, signature1], { account: user1.account });
      await publicClient.waitForTransactionReceipt({ hash: hash1 });

      // Second withdrawal with incremented nonce
      const signature2 = await createWithdrawSignature(signer, arcadzVault.address, amount2, 1n, deadline, user1.account.address, chainId);
      const hash2 = await arcadzVault.write.withdraw([amount2, 1n, deadline, signature2], { account: user1.account });
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      const userNonce = await arcadzVault.read.nonceByAddress([user1.account.address]);
      expect(userNonce).to.equal(2n);
      
      const vaultBalance = await mockToken.read.balanceOf([arcadzVault.address]);
      expect(vaultBalance).to.equal(parseEther("50")); // 100 - 30 - 20
    });
  });

  describe("Signature Verification", function () {
    it("Should verify valid signatures", async function () {
      const { arcadzVault, signer, user1, deadline, chainId } = await loadFixture(deployFixture);
      
      const amount = parseEther("50");
      const nonce = 0n;
      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      const isValid = await arcadzVault.read.verify([amount, nonce, deadline, user1.account.address, signature]);
      expect(isValid).to.be.true;
    });

    it("Should reject invalid signatures", async function () {
      const { arcadzVault, user1, user2, deadline, chainId } = await loadFixture(deployFixture);
      
      const amount = parseEther("50");
      const nonce = 0n;
      const wrongSignature = await createWithdrawSignature(user2, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      const isValid = await arcadzVault.read.verify([amount, nonce, deadline, user1.account.address, wrongSignature]);
      expect(isValid).to.be.false;
    });

    it("Should reject expired signatures", async function () {
      const { arcadzVault, signer, user1, chainId } = await loadFixture(deployFixture);

      const amount = parseEther("50");
      const nonce = 0n;
      const pastDeadline = 0n; // Expired deadline

      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, pastDeadline, user1.account.address, chainId);
      const isValid = await arcadzVault.read.verify([amount, nonce, pastDeadline, user1.account.address, signature]);
      expect(isValid).to.be.false;
    });

    it("Should reject signatures with wrong parameters", async function () {
      const { arcadzVault, signer, user1, user2, deadline, chainId } = await loadFixture(deployFixture);
      
      const amount = parseEther("50");
      const nonce = 0n;
      const signature = await createWithdrawSignature(signer, arcadzVault.address, amount, nonce, deadline, user1.account.address, chainId);

      // Wrong amount
      const wrongAmount = await arcadzVault.read.verify([amount + 1n, nonce, deadline, user1.account.address, signature]);
      expect(wrongAmount).to.be.false;
      
      // Wrong nonce
      const wrongNonce = await arcadzVault.read.verify([amount, nonce + 1n, deadline, user1.account.address, signature]);
      expect(wrongNonce).to.be.false;
      
      // Wrong user
      const wrongUser = await arcadzVault.read.verify([amount, nonce, deadline, user2.account.address, signature]);
      expect(wrongUser).to.be.false;
    });

    it("Should revert with invalid signature length", async function () {
      const { arcadzVault, user1, deadline } = await loadFixture(deployFixture);

      const invalidSignature = "0x1234"; // Too short
      
      await expect(
        arcadzVault.read.verify([parseEther("50"), 0n, deadline, user1.account.address, invalidSignature])
      ).to.be.rejectedWith("InvalidSignatureLength");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set bonez contract", async function () {
      const { arcadzVault, owner, mockToken } = await loadFixture(deployFixture);

      await arcadzVault.write.setBonez([mockToken.address], { account: owner.account });
      
      const bonezContract = await arcadzVault.read.bonezContract();
      expect(bonezContract).to.equal(getAddress(mockToken.address));
    });

    it("Should allow owner to set signer", async function () {
      const { arcadzVault, owner, user1, user2, deadline, chainId } = await loadFixture(deployFixture);
      
      await arcadzVault.write.setSigner([user1.account.address], { account: owner.account });
      
      // Verify new signer works
      const amount = parseEther("50");
      const nonce = 0n;
      const signature = await createWithdrawSignature(user1, arcadzVault.address, amount, nonce, deadline, user2.account.address, chainId);
      const isValid = await arcadzVault.read.verify([amount, nonce, deadline, user2.account.address, signature]);
      expect(isValid).to.be.true;
    });

    it("Should allow owner to emergency withdraw", async function () {
      const { arcadzVault, mockToken, owner, user1, publicClient } = await loadFixture(deployFixture);
      
      // Setup: deposit tokens to vault
      const depositAmount = parseEther("100");
      await mockToken.write.approve([arcadzVault.address, depositAmount], { account: user1.account });
      await arcadzVault.write.deposit([depositAmount], { account: user1.account });

      const initialOwnerBalance = await mockToken.read.balanceOf([owner.account.address]);

      const hash = await arcadzVault.write.emergencyWithdraw({ account: owner.account });
      await publicClient.waitForTransactionReceipt({ hash });
      
      const finalOwnerBalance = await mockToken.read.balanceOf([owner.account.address]);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + depositAmount);
      
      const vaultBalance = await mockToken.read.balanceOf([arcadzVault.address]);
      expect(vaultBalance).to.equal(0n);
    });

    it("Should allow owner to withdraw AVAX", async function () {
      const { arcadzVault, owner, publicClient } = await loadFixture(deployFixture);
      
      // Send some AVAX to contract
      const avaxAmount = parseEther("1");
      await owner.sendTransaction({
        to: arcadzVault.address,
        value: avaxAmount
      });

      const initialBalance = await publicClient.getBalance({ address: owner.account.address });

      const hash = await arcadzVault.write.withdrawAvax({ account: owner.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      const finalBalance = await publicClient.getBalance({ address: owner.account.address });
      const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

      // Convert to float values in AVAX
      const final = parseFloat(formatEther(finalBalance));
      const initial = parseFloat(formatEther(initialBalance));
      const delta = parseFloat(formatEther(avaxAmount - gasUsed));

      // Check balance increased (minus gas)
      expect(final).to.be.closeTo(initial + delta, 0.01);
    });

    it("Should revert when non-owner tries admin functions", async function () {
      const { arcadzVault, user1 } = await loadFixture(deployFixture);
      
      await expect(
        arcadzVault.write.setBonez([user1.account.address], { account: user1.account })
      ).to.be.rejected;
        
      await expect(
        arcadzVault.write.setSigner([user1.account.address], { account: user1.account })
      ).to.be.rejected;
        
      await expect(
        arcadzVault.write.emergencyWithdraw({ account: user1.account })
      ).to.be.rejected;
        
      await expect(
        arcadzVault.write.withdrawAvax({ account: user1.account })
      ).to.be.rejected;
    });
  });

  describe("Pausable", function () {
    it("Should allow owner to pause and unpause", async function () {
      const { arcadzVault } = await loadFixture(deployFixture);
      
      await arcadzVault.write.pause();
      expect(await arcadzVault.read.paused()).to.be.true;

      await arcadzVault.write.unpause();
      expect(await arcadzVault.read.paused()).to.be.false;
    });

    it("Should prevent deposits when paused", async function () {
      const { arcadzVault, mockToken, user1 } = await loadFixture(deployFixture);
      
      await arcadzVault.write.pause();
      await mockToken.write.approve([arcadzVault.address, parseEther("100")], { account: user1.account });
      
      await expect(
        arcadzVault.write.deposit([parseEther("100")], { account: user1.account })
      ).to.be.rejected;
    });

    it("Should prevent withdrawals when paused", async function () {
      const { arcadzVault, mockToken, signer, user1, deadline, chainId } = await loadFixture(deployFixture);

      // Setup deposit first
      const depositAmount = parseEther("100");
      await mockToken.write.approve([arcadzVault.address, depositAmount], { account: user1.account });
      await arcadzVault.write.deposit([depositAmount], { account: user1.account });

      await arcadzVault.write.pause();
      
      const signature = await createWithdrawSignature(signer, arcadzVault.address, parseEther("50"), 0n, deadline, user1.account.address, chainId);
      await expect(
        arcadzVault.write.withdraw([parseEther("50"), 0n, deadline, signature], { account: user1.account })
      ).to.be.rejected;
    });

    it("Should revert when non-owner tries to pause/unpause", async function () {
      const { arcadzVault, user1 } = await loadFixture(deployFixture);
      
      await expect(
        arcadzVault.write.pause({ account: user1.account })
      ).to.be.rejected;
        
      await expect(
        arcadzVault.write.unpause({ account: user1.account })
      ).to.be.rejected;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple users independently", async function () {
      const { arcadzVault, mockToken, signer, user1, user2, publicClient, deadline, chainId } = await loadFixture(deployFixture);

      const depositAmount = parseEther("100");
      
      // Both users deposit
      await mockToken.write.approve([arcadzVault.address, depositAmount], { account: user1.account });
      await mockToken.write.approve([arcadzVault.address, depositAmount], { account: user2.account });
      
      await arcadzVault.write.deposit([depositAmount], { account: user1.account });
      await arcadzVault.write.deposit([depositAmount], { account: user2.account });

      // Both users withdraw with their own nonces
      const withdrawAmount = parseEther("50");
      const signature1 = await createWithdrawSignature(signer, arcadzVault.address, withdrawAmount, 0n, deadline, user1.account.address, chainId);
      const signature2 = await createWithdrawSignature(signer, arcadzVault.address, withdrawAmount, 0n, deadline, user2.account.address, chainId);

      const hash1 = await arcadzVault.write.withdraw([withdrawAmount, 0n, deadline, signature1], { account: user1.account });
      const hash2 = await arcadzVault.write.withdraw([withdrawAmount, 0n, deadline, signature2], { account: user2.account });

      await publicClient.waitForTransactionReceipt({ hash: hash1 });
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      const nonce1 = await arcadzVault.read.nonceByAddress([user1.account.address]);
      const nonce2 = await arcadzVault.read.nonceByAddress([user2.account.address]);
      
      expect(nonce1).to.equal(1n);
      expect(nonce2).to.equal(1n);
    });

    it("Should handle very small amounts", async function () {
      const { arcadzVault, mockToken, signer, user1, publicClient, deadline, chainId } = await loadFixture(deployFixture);

      const smallAmount = 1n;
      await mockToken.write.approve([arcadzVault.address, smallAmount], { account: user1.account });
      await arcadzVault.write.deposit([smallAmount], { account: user1.account });

      const signature = await createWithdrawSignature(signer, arcadzVault.address, smallAmount, 0n, deadline, user1.account.address, chainId);
      const hash = await arcadzVault.write.withdraw([smallAmount, 0n, deadline, signature], { account: user1.account });
      await publicClient.waitForTransactionReceipt({ hash });

      const vaultBalance = await mockToken.read.balanceOf([arcadzVault.address]);
      expect(vaultBalance).to.equal(0n);
    });

    it("Should return domain separator", async function () {
      const { arcadzVault } = await loadFixture(deployFixture);
      
      const domainSeparator = await arcadzVault.read.getDomainSeparator();
      expect(domainSeparator).to.be.a('string');
      expect(domainSeparator).to.have.lengthOf(66); // 32 bytes in hex
    });
  });

  // Helper function to create withdrawal signatures using EIP-712
  async function createWithdrawSignature(
    signerWallet: WalletClient,
    vaultAddress: Address,
    amount: bigint,
    nonce: bigint,
    deadline: bigint,
    userAddress: Address,
    chainId: number
  ): Promise<`0x${string}`> {
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

    // Sign using EIP-712
    return signerWallet.signTypedData({
      account: signerWallet.account!,
      domain,
      types,
      primaryType: 'Withdraw',
      message,
    });
  }
});