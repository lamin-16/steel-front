'use strict';

let ml_kem768 = null;
let ml_dsa65 = null;

const enc = new TextEncoder();

async function init() {
  if (ml_kem768 && ml_dsa65) return;
  const kem = await import('@noble/post-quantum/ml-kem.js');
  const dsa = await import('@noble/post-quantum/ml-dsa.js');
  ml_kem768 = kem.ml_kem768;
  ml_dsa65 = dsa.ml_dsa65;
}

function ensureReady() {
  if (!ml_kem768 || !ml_dsa65) {
    throw new Error('PQC not initialized. Call await pqc.init() first.');
  }
}

function toB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromB64(str) {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

function generateKemKeypair() {
  ensureReady();
  const kp = ml_kem768.keygen();
  return {
    publicKey: toB64(kp.publicKey),
    privateKey: toB64(kp.secretKey),
    algorithm: 'ML-KEM-768'
  };
}

function generateSignKeypair() {
  ensureReady();
  const kp = ml_dsa65.keygen();
  return {
    publicKey: toB64(kp.publicKey),
    privateKey: toB64(kp.secretKey),
    algorithm: 'ML-DSA-65'
  };
}

function encapsulate(pubKeyB64) {
  ensureReady();
  const pk = fromB64(pubKeyB64);
  const result = ml_kem768.encapsulate(pk);
  return {
    sharedSecret: toB64(result.sharedSecret),
    cipherText: toB64(result.cipherText)
  };
}

function decapsulate(cipherTextB64, secretKeyB64) {
  ensureReady();
  const ct = fromB64(cipherTextB64);
  const sk = fromB64(secretKeyB64);
  const sharedSecret = ml_kem768.decapsulate(ct, sk);
  return { sharedSecret: toB64(sharedSecret) };
}

function sign(message, secretKeyB64) {
  ensureReady();
  const msg = typeof message === 'string' ? enc.encode(message) : message;
  const sk = fromB64(secretKeyB64);
  const signature = ml_dsa65.sign(msg, sk);
  return toB64(signature);
}

function verify(message, signatureB64, publicKeyB64) {
  ensureReady();
  try {
    const msg = typeof message === 'string' ? enc.encode(message) : message;
    const sig = fromB64(signatureB64);
    const pk = fromB64(publicKeyB64);
    return ml_dsa65.verify(sig, msg, pk);
  } catch (e) {
    return false;
  }
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    require('crypto').randomFillSync(arr);
  }
  return Buffer.from(arr).toString('hex');
}

module.exports = {
  init,
  generateKemKeypair,
  generateSignKeypair,
  encapsulate,
  decapsulate,
  sign,
  verify,
  randomHex,
  ALGORITHMS: {
    KEM: 'ML-KEM-768',
    SIGN: 'ML-DSA-65',
    STANDARD: 'NIST FIPS 203/204',
    SECURITY_LEVEL: 'Category 5 (AES-256 equivalent)'
  }
};
