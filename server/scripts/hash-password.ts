/** Prints an ADMIN_PASSWORD_HASH for .env. Usage: npm run hash-password -- '<password>' */
import { hashPassword } from '../src/auth.js';

const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error('usage: npm run hash-password -- <password with at least 12 characters>');
  process.exit(1);
}
console.log(hashPassword(pw));
