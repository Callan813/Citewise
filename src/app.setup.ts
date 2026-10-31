import { type INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

// Global app behaviour shared by main.ts and the e2e tests, so tests exercise
// exactly the same pipeline as production.
export function setupApp(app: INestApplication): void {
  // Safe default response headers, such as blocking MIME type sniffing.
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip fields that aren't in the DTO
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // turn plain JSON into DTO class instances
    }),
  );

  // Lets Docker/Kubernetes stop the container gracefully: Nest closes DB and
  // Redis connections on SIGTERM instead of being killed mid-request.
  app.enableShutdownHooks();
}
