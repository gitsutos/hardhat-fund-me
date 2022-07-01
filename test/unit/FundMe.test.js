const { assert, expect } = require("chai");
const { deployments, ethers, getNamedAccounts } = require("hardhat");

describe("FundMe", async function () {
  let fundMe;
  let deployer;
  let mockV3Aggregator;
  const sendValue = ethers.utils.parseEther("0.1");
  beforeEach(async function () {
    // deploy FundMe contract
    deployer = (await getNamedAccounts()).deployer;
    await deployments.fixture(["all"]);
    fundMe = await ethers.getContract("FundMe", deployer);
    mockV3Aggregator = await ethers.getContract("MockV3Aggregator", deployer);
  });

  describe("Constructor", async function () {
    // it sets the aggregator address correctly
    it("sets the aggregator address correctly", async function () {
      const response = await fundMe.getPriceFeed();
      assert.equal(response, mockV3Aggregator.address);
    });
  });

  describe("fund", async function () {
    it("Fails if ETH is not enough", async function () {
      await expect(fundMe.fund()).to.be.revertedWith(
        "You need to spend more ETH!"
      );
    });
    it("update the amount funded data structure", async function () {
      await fundMe.fund({ value: sendValue });
      const response = await fundMe.getAddressToAmountFunded(deployer);
      expect(response.toString()).to.be.equals(sendValue);
    });

    it("Adds funder to the funders Array", async function () {
      await fundMe.fund({ value: sendValue });
      const funder = await fundMe.getFunder(0);
      expect(funder).to.be.equals(deployer);
    });
  });

  describe("Withdraw", async function () {
    beforeEach(async function () {
      await fundMe.fund({ value: sendValue });
    });
    it("Withdraw ETH from a single funder", async function () {
      // Arrange
      const startFundMeBalance = await fundMe.provider.getBalance(
        fundMe.address
      );
      const startDeployerBalance = await fundMe.provider.getBalance(deployer);

      // Act
      const transactionResult = await fundMe.withdraw();
      const transactionReceipt = await transactionResult.wait(1);
      const { gasUsed, effectiveGasPrice } = transactionReceipt;

      const endFundMeBalance = await fundMe.provider.getBalance(fundMe.address);
      const endDeployerBalance = await fundMe.provider.getBalance(deployer);
      const gasCost = gasUsed.mul(effectiveGasPrice);
      // Assert
      assert.equal(endFundMeBalance, 0);
      assert.equal(
        startFundMeBalance.add(startDeployerBalance).toString(),
        endDeployerBalance.add(gasCost).toString()
      );
    });

    it("Allows us to withdraw with multiple accounts", async function () {
      const accounts = await ethers.getSigners();

      for (let i = 0; i > 5; i++) {
        const fundMeConnectedContract = fundMe.connect(accounts[i]);

        await fundMeConnectedContract.fund({ value: sendValue });
      }
      // Act
      const startFundMeBalance = await fundMe.provider.getBalance(
        fundMe.address
      );
      const startDeployerBalance = await fundMe.provider.getBalance(deployer);
      const transactionResult = await fundMe.withdraw();
      const transactionReceipt = await transactionResult.wait(1);
      const { gasUsed, effectiveGasPrice } = transactionReceipt;

      const endFundMeBalance = await fundMe.provider.getBalance(fundMe.address);
      const endDeployerBalance = await fundMe.provider.getBalance(deployer);
      const gasCost = gasUsed.mul(effectiveGasPrice);

      // Assert
      assert.equal(endFundMeBalance, 0);
      assert.equal(
        startFundMeBalance.add(startDeployerBalance).toString(),
        endDeployerBalance.add(gasCost).toString()
      );

      // Make sure to check that funders Array is reset correctly
      await expect(fundMe.getFunder(0)).to.be.reverted;

      for (let i = 0; i > 5; i++) {
        assert.equal(fundMe.getAddressToAmountFunded(accounts[i]), 0);
      }
    });

    it("Only allow owner to withdraw", async function () {
      const accounts = await ethers.getSigners();

      const attacker = accounts[4];
      const attackerConnectedContract = fundMe.connect(attacker);

      await expect(attackerConnectedContract.withdraw()).to.be.revertedWith(
        "FundMe_NotOwner"
      );
    });
  });
});
