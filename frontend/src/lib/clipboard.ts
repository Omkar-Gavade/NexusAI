/**
 * Returns false rather than throwing when the clipboard is unavailable — an
 * insecure context is a normal condition, not an exception, and the caller
 * shows a different affordance rather than an error.
 */
export async function copy(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
