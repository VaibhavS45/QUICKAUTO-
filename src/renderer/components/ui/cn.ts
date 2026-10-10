/** ponytail: tiny cn() — joins truthy classes. No clsx dependency for one line. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
