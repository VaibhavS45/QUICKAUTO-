import type { ProfileSettingsService } from './profile-settings.js'

export interface AuthProfile {
  name: string
  email: string
}

export interface AuthProvider {
  getCurrentProfile(): AuthProfile
}

export class LocalProfileAuth implements AuthProvider {
  constructor(private readonly profiles: Pick<ProfileSettingsService, 'get'>) {}

  getCurrentProfile(): AuthProfile {
    const profile = this.profiles.get()
    return {
      name: profile.name.trim() || 'Local profile',
      email: profile.email
    }
  }
}
