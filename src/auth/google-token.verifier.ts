import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { AppConfig } from '../config/configuration.js';

export interface GoogleProfile {
  googleId: string;
  email: string;
}

// Behind an abstract class so tests can sign in without calling Google.
export abstract class GoogleTokenVerifier {
  abstract verify(idToken: string): Promise<GoogleProfile>;
}

@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly clientId: string;

  constructor(config: ConfigService<AppConfig, true>) {
    super();
    this.clientId = config.get('google', { infer: true }).clientId;
  }

  // The browser hands us this token, so nothing in it counts until this passes.
  // The library checks Google's signature, the issuer and the expiry. The
  // audience check stops a token issued for some other website being reused here.
  async verify(idToken: string): Promise<GoogleProfile> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google sign-in could not be verified');
    }

    // We match accounts by email, so it has to be one Google has confirmed.
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google sign-in could not be verified');
    }
    return { googleId: payload.sub, email: payload.email };
  }
}
