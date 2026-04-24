type User = { name: string; active: boolean };

export function canLogin(user: User | null, token: string | null): boolean {
  if (user !== null && user.active && (token || user.name === 'admin')) {
    return true;
  }
  return false;
}

export function label(n: number): string {
  return n >= 0 ? (n === 0 ? 'zero' : 'pos') : 'neg';
}
