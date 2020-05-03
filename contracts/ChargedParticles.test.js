const { accounts, provider } = require('@openzeppelin/test-environment');
const { TestHelper } = require('@openzeppelin/cli');
const { constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { Contracts, ZWeb3 } = require('@openzeppelin/upgrades');

ZWeb3.initialize(provider);
const { web3 } = ZWeb3;

const ChargedParticles = Contracts.getFromLocal('ChargedParticles');
const ChargedParticlesERC1155 = Contracts.getFromLocal('ChargedParticlesERC1155');

describe('ChargedParticles', () => {
  let [owner, nonOwner] = accounts;
  let contractInstance;
  let tokenManagerInstance;
  let helper;

  beforeEach(async () => {
    helper = await TestHelper();
  });

  test('initializer', async () => {
    contractInstance = await helper.createProxy(ChargedParticles, { initMethod: 'initialize', initArgs: [owner] });
    const version = await contractInstance.methods.version().call({ from: owner });
    expect(web3.utils.hexToAscii(version)).toMatch("v0.3.5");
  });

  describe('only Admin/DAO', () => {
    beforeEach(async () => {
      contractInstance = await helper.createProxy(ChargedParticles, { initMethod: 'initialize', initArgs: [owner] });
    });

    test('setupFees', async () => {
      const toWei = (amnt) => web3.utils.toWei(amnt, 'ether');
      const fromWei = (amnt) => web3.utils.fromWei(amnt, 'ether');

      await expectRevert(
        contractInstance.methods.setupFees(toWei('0.5'), toWei('0.3')).send({ from: nonOwner }),
        "Ownable: caller is not the owner"
      );
      await contractInstance.methods.setupFees(toWei('0.5'), toWei('0.3')).send({ from: owner });
      
      const { 0: createFeeEth, 1: createFeeIon } = await contractInstance.methods.getCreationPrice(false).call({ from: owner });
      expect(fromWei(createFeeEth)).toBe('0.5');
      expect(fromWei(createFeeIon)).toBe('0.3');
      
      const { 0: createFeeEthForNFT, 1: createFeeIonForNFT } = await contractInstance.methods.getCreationPrice(true).call({ from: owner });
      expect(fromWei(createFeeEthForNFT)).toBe("1");
      expect(fromWei(createFeeIonForNFT)).toBe("0.6");
    });

    test('setPausedState', async () => {
      let isPaused = await contractInstance.methods.isPaused().call({ from: nonOwner });
      expect(isPaused).toBe(false);

      await expectRevert(
        contractInstance.methods.setPausedState(false).send({ from: nonOwner }),
        "Ownable: caller is not the owner"
      );

      await contractInstance.methods.setPausedState(true).send({ from: owner });

      isPaused = await contractInstance.methods.isPaused().call({ from: nonOwner });
      expect(isPaused).toBe(true);

      await contractInstance.methods.setPausedState(false).send({ from: owner });

      isPaused = await contractInstance.methods.isPaused().call({ from: owner });
      expect(isPaused).toBe(false);
    });
  });

  describe('with Token manager', () => {
    beforeEach(async () => {
      contractInstance = await helper.createProxy(ChargedParticles, { initMethod: 'initialize', initArgs: [owner] });
      tokenManagerInstance = await helper.createProxy(ChargedParticlesERC1155, { initMethod: 'initialize', initArgs: [owner] });
    });

    test('registerTokenManager', async () => {
      await expectRevert(
        contractInstance.methods.registerTokenManager(tokenManagerInstance.address).send({ from: nonOwner }),
        "Ownable: caller is not the owner"
      );
      
      await expectRevert(
        contractInstance.methods.registerTokenManager(constants.ZERO_ADDRESS).send({ from: owner }),
        "E412"
      );
    });

    test('mintIons', async () => {
      const mintFee = web3.utils.toWei('1', 'ether')

      await contractInstance.methods.registerTokenManager(tokenManagerInstance.address).send({ from: owner });
      await tokenManagerInstance.methods.setChargedParticles(contractInstance.address).send({ from: owner });
      await expectRevert(
        contractInstance.methods.mintIons('https://www.example.com', 1337, 42, mintFee).send({ from: nonOwner }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        contractInstance.methods.mintIons('', 1337, 42, mintFee).send({ from: owner }),
        "E107"
      );

      const receipt = await contractInstance.methods.mintIons('https://www.example.com', 1337, 42, mintFee).send({ from: owner, gas: 5e6 });
      expectEvent(receipt, 'PlasmaTypeUpdated', {
        _symbol: web3.utils.keccak256('ION'),
        _isPrivate: false,
        _initialMint: '42',
        _uri: 'https://www.example.com'
      });

      await expectRevert(
        contractInstance.methods.mintIons('https://www.example.com', 1337, 42, mintFee).send({ from: owner }),
        "E416"
      );
    });
  });
});
