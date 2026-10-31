import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../auth/jwt-payload.interface.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

// Registered globally in AuthModule, so it protects every route unless the
// route is marked @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      // Checks the signature AND the expiry. No database lookup needed - that's
      // the point of a JWT: the token proves itself.
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractBearerToken(req: AuthenticatedRequest): string | undefined {
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
