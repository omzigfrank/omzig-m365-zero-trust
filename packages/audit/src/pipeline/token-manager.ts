/**
 * Token manager for Graph API access tokens.
 * Phase 2: accepts token directly from API request.
 * Phase 4: will add auto-refresh with stored refresh tokens.
 */

export class TokenManager {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Placeholder for Phase 4: auto-refresh with fallback.
   * When onboarding stores refresh tokens (Phase 4), this will
   * attempt silent refresh and fall back to "needs re-authorization".
   */
  async refreshIfNeeded(): Promise<string> {
    return this.accessToken;
  }
}
