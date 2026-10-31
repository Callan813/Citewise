import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// The auth guard runs on every route. Mark the few routes that don't need a
// token (login, register, health) with @Public(). Forgetting the decorator
// fails safe: the route stays protected.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
