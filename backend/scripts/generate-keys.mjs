#!/usr/bin/env node
/** Prints an Ed25519 keypair for JWT_PRIVATE_KEY / JWT_PUBLIC_KEY. */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const inline = (pem) => JSON.stringify(pem.trim());
console.log(`JWT_PRIVATE_KEY=${inline(privateKey)}`);
console.log(`JWT_PUBLIC_KEY=${inline(publicKey)}`);
