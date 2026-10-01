/**
 * Gera o hash do seu código de acesso e uma SESSION_SECRET aleatória,
 * prontos para colar no .env.
 *
 *   npm run passcode -- meu-codigo-secreto
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const passcode = process.argv[2];

if (!passcode) {
  console.error('\nUso:  npm run passcode -- "seu-codigo-aqui"\n');
  process.exit(1);
}
if (passcode.length < 6) {
  console.error('\nUse um código com pelo menos 6 caracteres.\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(passcode, 12);
const secret = crypto.randomBytes(48).toString('base64url');

console.log(`
Cole estas duas linhas no seu arquivo .env (e nas variáveis de ambiente da Vercel):

PASSCODE_HASH='${hash}'
SESSION_SECRET='${secret}'

Guarde o código "${passcode}" — é ele que você digita para entrar.
O código em si nunca é salvo em lugar nenhum, só o hash acima.
`);
