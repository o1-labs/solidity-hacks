import { expect } from "chai";
import { ethers } from "hardhat";
import { InvestmentDAO } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("InvestmentDAO", function () {
  let investmentDAO: InvestmentDAO;
  let investor1: HardhatEthersSigner;
  let investor2: HardhatEthersSigner;

  beforeEach(async function () {
    [, investor1, investor2] = await ethers.getSigners();

    const InvestmentDAOFactory = await ethers.getContractFactory("InvestmentDAO");
    investmentDAO = await InvestmentDAOFactory.deploy();
  });

  describe("Investment functionality", function () {
    it("Should allow investors to invest ETH", async function () {
      const investmentAmount = ethers.parseEther("1.0");

      await expect(investmentDAO.connect(investor1).invest({ value: investmentAmount }))
        .to.emit(investmentDAO, "Investment")
        .withArgs(investor1.address, investmentAmount);

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(investmentAmount);
      expect(await investmentDAO.getTotalFunds()).to.equal(investmentAmount);
    });

    it("Should accumulate multiple investments from same investor", async function () {
      const firstInvestment = ethers.parseEther("1.0");
      const secondInvestment = ethers.parseEther("0.5");

      await investmentDAO.connect(investor1).invest({ value: firstInvestment });
      await investmentDAO.connect(investor1).invest({ value: secondInvestment });

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(
        firstInvestment + secondInvestment
      );
    });

    it("Should track investments from multiple investors separately", async function () {
      const investor1Investment = ethers.parseEther("1.0");
      const investor2Investment = ethers.parseEther("2.0");

      await investmentDAO.connect(investor1).invest({ value: investor1Investment });
      await investmentDAO.connect(investor2).invest({ value: investor2Investment });

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(investor1Investment);
      expect(await investmentDAO.getInvestment(investor2.address)).to.equal(investor2Investment);
      expect(await investmentDAO.getTotalFunds()).to.equal(
        investor1Investment + investor2Investment
      );
    });

    it("Should revert when trying to invest 0 ETH", async function () {
      await expect(investmentDAO.connect(investor1).invest({ value: 0 })).to.be.revertedWith(
        "Investment amount must be greater than 0"
      );
    });
  });

  describe("Withdrawal functionality", function () {
    beforeEach(async function () {
      // Setup: investor1 invests 2 ETH
      await investmentDAO.connect(investor1).invest({ value: ethers.parseEther("2.0") });
    });

    it("Should allow investors to withdraw their investment", async function () {
      const withdrawAmount = ethers.parseEther("1.0");
      const initialBalance = await ethers.provider.getBalance(investor1.address);

      const tx = await investmentDAO.connect(investor1).withdrawInvestment(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(
        ethers.parseEther("1.0")
      );
      expect(await investmentDAO.getTotalFunds()).to.equal(ethers.parseEther("1.0"));

      const finalBalance = await ethers.provider.getBalance(investor1.address);
      expect(finalBalance).to.be.closeTo(
        initialBalance + withdrawAmount - gasUsed,
        ethers.parseEther("0.001")
      );
    });

    it("Should emit Withdrawal event", async function () {
      const withdrawAmount = ethers.parseEther("1.0");

      await expect(investmentDAO.connect(investor1).withdrawInvestment(withdrawAmount))
        .to.emit(investmentDAO, "Withdrawal")
        .withArgs(investor1.address, withdrawAmount);
    });

    it("Should allow full investment withdrawal", async function () {
      const fullInvestment = await investmentDAO.getInvestment(investor1.address);

      await investmentDAO.connect(investor1).withdrawInvestment(fullInvestment);

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(0);
      expect(await investmentDAO.getTotalFunds()).to.equal(0);
    });

    it("Should revert when trying to withdraw 0 ETH", async function () {
      await expect(investmentDAO.connect(investor1).withdrawInvestment(0)).to.be.revertedWith(
        "Withdrawal amount must be greater than 0"
      );
    });

    it("Should revert when trying to withdraw more than investment", async function () {
      const excessiveAmount = ethers.parseEther("3.0");

      await expect(
        investmentDAO.connect(investor1).withdrawInvestment(excessiveAmount)
      ).to.be.revertedWith("Insufficient investment balance");
    });

    it("Should revert when investor with no investment tries to withdraw", async function () {
      await expect(
        investmentDAO.connect(investor2).withdrawInvestment(ethers.parseEther("1.0"))
      ).to.be.revertedWith("Insufficient investment balance");
    });

    it("Should handle multiple partial withdrawals correctly", async function () {
      const firstWithdraw = ethers.parseEther("0.7");
      const secondWithdraw = ethers.parseEther("0.8");

      await investmentDAO.connect(investor1).withdrawInvestment(firstWithdraw);
      await investmentDAO.connect(investor1).withdrawInvestment(secondWithdraw);

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(
        ethers.parseEther("0.5")
      );
    });
  });

  describe("DAO fund management", function () {
    it("Should handle investment and withdrawal operations correctly", async function () {
      // This test demonstrates normal DAO operations
      const investmentAmount = ethers.parseEther("1.0");

      await investmentDAO.connect(investor1).invest({ value: investmentAmount });

      // Normal withdrawal should work fine
      await expect(investmentDAO.connect(investor1).withdrawInvestment(investmentAmount))
        .to.emit(investmentDAO, "Withdrawal")
        .withArgs(investor1.address, investmentAmount);

      expect(await investmentDAO.getInvestment(investor1.address)).to.equal(0);
    });

    it("Should maintain accurate investment tracking", async function () {
      // Test that the DAO correctly tracks total investments
      const investment1 = ethers.parseEther("1.0");
      const investment2 = ethers.parseEther("2.0");

      await investmentDAO.connect(investor1).invest({ value: investment1 });
      await investmentDAO.connect(investor2).invest({ value: investment2 });

      expect(await investmentDAO.totalInvestments()).to.equal(investment1 + investment2);

      await investmentDAO.connect(investor1).withdrawInvestment(investment1);
      expect(await investmentDAO.totalInvestments()).to.equal(investment2);
    });
  });
});
