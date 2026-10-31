import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { AuthService } from './auth.service.js';
import { AuthConfigResponseDto } from './dto/auth-config-response.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@ApiTags('Auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit('register', 5, 3600)
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid email or password too short' })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto);
  }

  // Tells the frontend which sign-in options to show.
  @Get('config')
  @ApiOkResponse({ type: AuthConfigResponseDto })
  getConfig(): AuthConfigResponseDto {
    return this.auth.getConfig();
  }

  @Post('google')
  @RateLimit('google', 20, 60)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'The Google token is not valid' })
  @ApiConflictResponse({
    description: 'Email linked to another Google account',
  })
  @ApiServiceUnavailableResponse({
    description: 'Google sign-in is not set up',
  })
  google(@Body() dto: GoogleLoginDto): Promise<AuthResponseDto> {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  // POST defaults to 201 Created, but logging in doesn't create anything.
  @Post('login')
  @RateLimit('login', 10, 60)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto);
  }
}
