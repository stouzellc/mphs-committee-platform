// Password rules for committee members: long, not common, not built from the person's own details or the class name.
export const MIN_LENGTH = 12;
export const MAX_LENGTH = 200;

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', '123456', '1234567', '12345678', '123456789',
  '1234567890', '12345678910', '123456789012', 'qwerty', 'qwerty123', 'qwertyuiop', '1q2w3e4r', '1q2w3e4r5t6y', 'iloveyou', 'admin',
  'admin123', 'welcome', 'welcome1', 'welcome123', 'letmein', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess',
  'abc123', 'abcdef123456', '111111111111', '000000000000', 'aaaaaaaaaaaa', 'changeme', 'trustno1', 'superman', 'batman',
  'starwars', 'whatever', 'shadow', 'master', 'michael', 'jennifer', 'ashley', 'charlie', 'passwordpassword', 'qwertyqwerty',
]);
const CONTEXT = ['mphs', 'mountpleasant', 'pleasant', 'kiltie', 'kilties', 'classof2008', 'reunion', 'beyondtheshore', 'providence', 'mphs2008'];

export function passwordProblem(password, user = {}) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters. A short phrase of three or four words works well.`;
  if (password.length > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`;
  const lower = password.toLowerCase();
  const letters = lower.replace(/[^a-z0-9]/g, '');
  if (new Set(password).size < 5) return 'Use a wider mix of characters.';
  if (COMMON.has(lower) || COMMON.has(letters)) return 'That password is too common.';
  const stripped = letters.replace(/\d+$/, '').replace(/^\d+/, '');
  if (CONTEXT.some((w) => stripped === w || (letters.includes(w) && letters.length - w.length < 8))) return 'Avoid building the password around the school or class name.';
  const local = String(user.email || '').toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '');
  const nameParts = String(user.displayName || '').toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
  if ((local.length >= 4 && letters.includes(local)) || nameParts.some((p) => letters.includes(p) && letters.length - p.length < 8)) {
    return 'Avoid using your name or email address in the password.';
  }
  return null;
}
