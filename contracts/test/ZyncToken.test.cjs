const { expect } = require("chai");
const hre = require("hardhat");

describe("ZyncToken", function () {
  it("mints ZYNC for ETH at the public price", async function () {
    const [, buyer] = await hre.ethers.getSigners();
    const price = hre.ethers.parseEther("0.001");
    const Z = await hre.ethers.getContractFactory("ZyncToken");
    const token = await Z.deploy(price);
    await token.waitForDeployment();

    const tx = await token.connect(buyer).mintWithEth({ value: price });
    await tx.wait();

    const bal = await token.balanceOf(buyer.address);
    expect(bal).to.equal(hre.ethers.parseEther("1"));

    expect(await hre.ethers.provider.getBalance(await token.getAddress())).to.equal(price);
  });

  async function deployWithHolderBalance(amount) {
    const [owner, holder, spender] = await hre.ethers.getSigners();
    const Z = await hre.ethers.getContractFactory("ZyncToken");
    const token = await Z.deploy(hre.ethers.parseEther("0.001"));
    await token.waitForDeployment();
    await (await token.mintTo(holder.address, amount)).wait();
    return { token, owner, holder, spender };
  }

  it("lets a holder burn their own tokens and emits Burned", async function () {
    const start = hre.ethers.parseEther("100");
    const { token, holder } = await deployWithHolderBalance(start);
    const burnAmt = hre.ethers.parseEther("40");

    await expect(token.connect(holder).burn(burnAmt))
      .to.emit(token, "Burned")
      .withArgs(holder.address, burnAmt);

    expect(await token.balanceOf(holder.address)).to.equal(start - burnAmt);
    expect(await token.totalSupply()).to.equal(start - burnAmt);
  });

  it("reverts when burning more than the balance", async function () {
    const start = hre.ethers.parseEther("10");
    const { token, holder } = await deployWithHolderBalance(start);

    await expect(
      token.connect(holder).burn(start + 1n)
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
  });

  it("burnFrom spends the allowance and burns", async function () {
    const start = hre.ethers.parseEther("100");
    const { token, holder, spender } = await deployWithHolderBalance(start);
    const amt = hre.ethers.parseEther("30");

    await (await token.connect(holder).approve(spender.address, amt)).wait();

    await expect(token.connect(spender).burnFrom(holder.address, amt))
      .to.emit(token, "Burned")
      .withArgs(holder.address, amt);

    expect(await token.balanceOf(holder.address)).to.equal(start - amt);
    expect(await token.allowance(holder.address, spender.address)).to.equal(0);
  });

  it("burnFrom reverts without allowance", async function () {
    const start = hre.ethers.parseEther("100");
    const { token, holder, spender } = await deployWithHolderBalance(start);

    await expect(
      token.connect(spender).burnFrom(holder.address, 1n)
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
  });
});
