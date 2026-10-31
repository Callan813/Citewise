import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// What the auth guard attaches to the request after verifying the token.
export interface AuthUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

// Usage: me(@CurrentUser() user: AuthUser)
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user!;
  },
);
