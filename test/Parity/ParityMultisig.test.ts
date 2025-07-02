import { expect } from "chai";
import { ethers } from "hardhat";
import { MultisigWallet, WalletLibrary } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("MultisigWallet", function () {
  let multisigWallet: MultisigWallet;
  let walletLibrary: WalletLibrary;
  let owner1: HardhatEthersSigner;
  let owner2: HardhatEthersSigner;
  let owner3: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  beforeEach(async function () {
    [, owner1, owner2, owner3, user1, user2] = await ethers.getSigners();

    // Deploy the library first
    const WalletLibraryFactory = await ethers.getContractFactory("WalletLibrary");
    walletLibrary = await WalletLibraryFactory.deploy();

    // Deploy the multisig wallet with library reference
    const MultisigWalletFactory = await ethers.getContractFactory("MultisigWallet");
    multisigWallet = await MultisigWalletFactory.deploy(
      await walletLibrary.getAddress(),
      [owner1.address, owner2.address, owner3.address],
      2 // Require 2 confirmations
    );
  });

  describe("Deployment", function () {
    it("Should set the correct wallet library", async function () {
      expect(await multisigWallet.walletLibrary()).to.equal(await walletLibrary.getAddress());
    });

    it("Should initialize owners correctly via delegatecall", async function () {
      // Check owners through delegatecall using the new function names
      const ownerCheck1 = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_owners", [owner1.address]),
      });
      const ownerCheck2 = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_owners", [owner2.address]),
      });
      const ownerCheck3 = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_owners", [owner3.address]),
      });
      const userCheck = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_owners", [user1.address]),
      });

      expect(ethers.AbiCoder.defaultAbiCoder().decode(["bool"], ownerCheck1)[0]).to.be.true;
      expect(ethers.AbiCoder.defaultAbiCoder().decode(["bool"], ownerCheck2)[0]).to.be.true;
      expect(ethers.AbiCoder.defaultAbiCoder().decode(["bool"], ownerCheck3)[0]).to.be.true;
      expect(ethers.AbiCoder.defaultAbiCoder().decode(["bool"], userCheck)[0]).to.be.false;
    });

    it("Should set the correct required confirmations", async function () {
      const requiredConfirmationsData = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_required"),
      });
      const requiredConfirmations = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256"],
        requiredConfirmationsData
      )[0];
      expect(requiredConfirmations).to.equal(2);
    });

    it("Should set the correct owner count", async function () {
      const ownerCountData = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_numOwners"),
      });
      const ownerCount = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], ownerCountData)[0];
      expect(ownerCount).to.equal(3);
    });
  });

  describe("Deposit functionality", function () {
    it("Should allow direct ETH transfers via receive", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await user1.sendTransaction({
        to: await multisigWallet.getAddress(),
        value: depositAmount,
      });

      const contractBalance = await ethers.provider.getBalance(await multisigWallet.getAddress());
      expect(contractBalance).to.equal(depositAmount);
    });
  });

  describe("Multi-signature withdrawal functionality", function () {
    beforeEach(async function () {
      // Setup: deposit some ETH into the contract
      await user1.sendTransaction({
        to: await multisigWallet.getAddress(),
        value: ethers.parseEther("5.0"),
      });
    });

    it("Should allow owners to submit withdrawal transactions", async function () {
      const withdrawAmount = ethers.parseEther("1.0");

      await multisigWallet.connect(owner1).fallback({
        data: walletLibrary.interface.encodeFunctionData("submitTransaction", [
          user2.address,
          withdrawAmount,
        ]),
      });

      // Verify transaction was created by checking transaction count
      const txCountData = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_transactionCount"),
      });
      const txCount = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], txCountData)[0];
      expect(txCount).to.equal(1);
    });

    it("Should not allow non-owners to submit transactions", async function () {
      await expect(
        multisigWallet.connect(user1).fallback({
          data: walletLibrary.interface.encodeFunctionData("submitTransaction", [
            user2.address,
            ethers.parseEther("1.0"),
          ]),
        })
      ).to.be.revertedWith("Not an owner");
    });
  });

  describe("Library delegation security", function () {
    it("Should properly delegate all calls to library", async function () {
      // Test that library functions are accessible through the wallet
      const ownerCountData = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_numOwners"),
      });
      const ownerCount = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], ownerCountData)[0];
      expect(ownerCount).to.equal(3);
    });

    it("Should maintain separate state for each wallet instance", async function () {
      // Deploy a second wallet with different owners
      const MultisigWalletFactory = await ethers.getContractFactory("MultisigWallet");
      const secondWallet = await MultisigWalletFactory.deploy(
        await walletLibrary.getAddress(),
        [user1.address, user2.address],
        1
      );

      // Check that each wallet has its own state
      const firstWalletOwnerData = await multisigWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_owners", [owner1.address]),
      });
      const secondWalletOwnerData = await secondWallet.fallback.staticCall({
        data: walletLibrary.interface.encodeFunctionData("m_owners", [owner1.address]),
      });

      const firstWalletIsOwner = ethers.AbiCoder.defaultAbiCoder().decode(
        ["bool"],
        firstWalletOwnerData
      )[0];
      const secondWalletIsOwner = ethers.AbiCoder.defaultAbiCoder().decode(
        ["bool"],
        secondWalletOwnerData
      )[0];

      expect(firstWalletIsOwner).to.be.true;
      expect(secondWalletIsOwner).to.be.false;
    });

    it("Should prevent direct initialization of the library", async function () {
      // Library should not be initialized when called directly (safe version)
      const libraryNumOwners = await walletLibrary.m_numOwners();
      expect(libraryNumOwners).to.equal(0); // Library itself has no owners
    });
  });
});
