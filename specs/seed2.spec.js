const crypto = require('crypto')
const _secureRandom = require('../lib/secureRandom')
const _entropy = require('../src/entropy')
const _seed = require('../src/seed')
const _generate = require('../src/generate')
const bip39 = require('bip39')
const forge = require('node-forge')
const { sha224 } = require('../lib/cryptoUtils')()
const { expect } = require('chai')
const { spy } = require('sinon')
const testWallet = require('./testWallet.json')
const testKeys = require('./testKeys')
const fs = require('fs')
it('BIP 39 should generates the same seed/12 word seed result as python', async () => {
  [
    {
      index: 0,
      entropy: '3b13f9cb9ddea905883fa8d3ff7b1247',
      twelveWords:
        'deposit panther indicate desert tunnel lizard can vital stadium wink setup moment'
    },
    {
      index: 1,
      entropy: 'e1f9700dee95018fa20d47164fb5ed41',
      twelveWords:
        'tiger slide address tag exotic sick market pottery bind laundry kitten lonely'
    },
    {
      index: 2,
      entropy: 'ca1a79386919b745cefc0e50dec6afa3',
      twelveWords:
        'skate stable evoke split opinion pepper desk limb express wage program elder'
    }
  ].forEach(({ entropy, twelveWords }) => {
    expect(bip39.entropyToMnemonic(entropy)).to.be.equal(twelveWords)
    expect(bip39.mnemonicToEntropy(twelveWords).toString('hex')).to.be.equal(
      entropy
    )
  })
})
it('Should be able to SHA224 a public key to get an address (like python)', async () => {
  const { PublicKey, Address } = testWallet
  expect(sha224(PublicKey)).to.equal(Address)
})
it('Should be able to generate entropy using user data', async () => {
  const secureRandom = _secureRandom({
    entropyStr: 'test',
    crypto
  })
  const entropy = _entropy({
    secureRandom
  })
  while (!entropy.seedingDone()) {
    // Fake Random mouse
    entropy.entropyFromCoordinates({
      XClient: Math.floor(Math.random() * 800),
      YClient: Math.floor(Math.random() * 600)
    })
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  expect(secureRandom.pool.length).to.be.at.least(256)
  const entropySha = entropy.getPoolSha256()
  expect(entropySha).to.be.a('String')
  expect(entropySha.length).to.be.equal(64)
}).timeout(30000)

it('Should be able to make a mnemonic seed from entropy', async () => {
  // HERE make seed.js FIXE take slice32from sha
  const entropySha =
    'd4f5e041a28182e9dbd810fee3375cfbd89bd137dbf95adb68087cf3198b780a'
  const twelveWords = _seed.makeMnemonicFromEntropySha(entropySha)
  expect(twelveWords.split(' ').length).to.be.equal(12)
  const prng = _seed.makeSeededPrngFromMneomic(twelveWords, 'mypass')
  expect(prng.next()).to.be.a('Number')
  expect(prng.nextBytesAsString()).to.be.a('String')
})
it('Should be able to take an mnemonic seed and make an RSA key and BIS address out of it (multi-threaded)', async () => {
  const twelveWords =
    'deposit panther indicate desert tunnel lizard can vital stadium wink setup moment'
  const prng = _seed.makeSeededPrngFromMneomic(twelveWords, 'mypass')
  const arc4SpyNextBytesAsString = spy(prng, 'nextBytesAsString')
  const arc4SpyNext = spy(prng, 'next')
  const generateKeyPair = forge.pki.rsa.generateKeyPair
  const rsaSpy = spy(generateKeyPair)
  const { generateKeys } = _generate({
    prng,
    generateKeyPair: rsaSpy,
    workers: -1
  })
  // prng should be primed on init
  expect(arc4SpyNext.callCount).to.equal(300)
  const { publicKey, privateKey, address } = await generateKeys({ bits: 4096 })
  expect(rsaSpy.called).to.be.true
  expect(arc4SpyNextBytesAsString.called).to.be.true
  expect(privateKey).to.contain('BEGIN RSA PRIVATE KEY')
  expect(publicKey).to.contain('BEGIN PUBLIC KEY')
  expect(address.length).to.equal(56)
  return address
}).timeout(1760000)
it('Should be able to make deterministic keys (single thread) from 12 seed + pass', async () => {
  const prng = _seed.makeSeededPrngFromMneomic(testKeys.twelveWords, 'mypass')
  const arc4SpyNext = spy(prng, 'next')
  const { generateKeysInSteps } = _generate({
    prng
  })
  // prng should be primed on init
  expect(arc4SpyNext.callCount).to.equal(300)
  const { publicKey, privateKey, address } = await generateKeysInSteps({
    bits: 4096
  })
  expect(privateKey).to.contain('BEGIN RSA PRIVATE KEY')
  expect(publicKey).to.contain('BEGIN PUBLIC KEY')
  expect(address.length).to.equal(56)
  // fs.writeFileSync(
  //  './testKeys.json',
  //  JSON.stringify({ publicKey, privateKey, address })
  // )
  expect(publicKey).to.equal(testKeys.publicKey)
  expect(privateKey).to.equal(testKeys.privateKey)
  expect(address).to.equal(testKeys.address)
}).timeout(1760000)
