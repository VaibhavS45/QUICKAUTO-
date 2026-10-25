/** `rejected` = the provider said no (bad/expired grant). `network` = could not reach it. */
export class OAuthError extends Error {
  constructor(message: string, readonly kind: 'rejected' | 'network' | 'invalid') {
    super(message)
    this.name = 'OAuthError'
  }
}
