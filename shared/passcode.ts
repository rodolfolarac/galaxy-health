/**
 * O código é comparado sem espaços nas pontas e em minúsculas: no celular o
 * teclado costuma pôr maiúscula no início e o autocompletar, um espaço no
 * fim. O login e o `npm run passcode` usam a mesma normalização.
 */
export function normalizePasscode(input: string) {
  return input.trim().toLowerCase();
}
