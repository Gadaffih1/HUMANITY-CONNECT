export function googleSignInError(error: unknown, hostname: string): Error {
  if (typeof error === 'object' && error !== null && 'code' in error &&
      error.code === 'auth/unauthorized-domain') {
    return new Error(
      `Google Sign-In is not configured for ${hostname}. An administrator must add this hostname to Firebase Authentication's authorized domains. You can still sign in with email and password.`
    );
  }
  return error instanceof Error ? error : new Error('Google Sign-In failed.');
}
