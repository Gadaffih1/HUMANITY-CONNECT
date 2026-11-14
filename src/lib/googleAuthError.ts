export function googleSignInError(error: unknown, hostname: string): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === 'auth/unauthorized-domain') {
      return new Error(
        `Google Sign-In is not configured for ${hostname}. An administrator must add this hostname to Firebase Authentication's authorized domains. You can still sign in with email and password.`
      );
    }
    if (error.code === 'auth/popup-blocked') {
      return new Error(
        'Google Sign-In popup was blocked by your browser. Allow popups or sign in directly with email and password.'
      );
    }
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      return new Error(
        'Google Sign-In window was closed before completing. Try again or sign in with email and password.'
      );
    }
  }
  return error instanceof Error ? error : new Error('Google Sign-In failed.');
}
