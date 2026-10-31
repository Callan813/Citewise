import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { AppConfig } from '../config/configuration.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      // The global guard lives outside this module but needs JwtService too.
      global: true,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
      ): JwtModuleOptions => {
        const jwt = config.get('jwt', { infer: true });
        return {
          secret: jwt.secret,
          signOptions: {
            expiresIn: jwt.expiresIn as NonNullable<
              JwtModuleOptions['signOptions']
            >['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Secure by default: every route in the app needs a valid token unless
    // it's marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
