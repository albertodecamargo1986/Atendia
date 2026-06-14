const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);

console.log('RSA-2048 key pair generated:');
console.log(`  Private: ${path.join(keysDir, 'private.pem')}`);
console.log(`  Public:  ${path.join(keysDir, 'public.pem')}`);
console.log('\nIMPORTANT: Keep private.pem secure and never commit it to version control.');
