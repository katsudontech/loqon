/**
 * Deliberately tiny client-side reporting seam. A monitoring adapter can be
 * added here later without coupling route boundaries to a vendor or secret.
 */
export function reportClientError(error: unknown, context: string): void {
  console.error(`[${context}]`, error)
}
