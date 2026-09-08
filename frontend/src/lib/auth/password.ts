export const PASSWORD_MIN_LENGTH = 8;

export function passwordValidation(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Include an uppercase letter, a lowercase letter, and a number.";
  }
  return null;
}
