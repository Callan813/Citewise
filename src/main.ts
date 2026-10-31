import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  // bufferLogs holds early boot logs until the pino logger is ready, so even
  // startup messages come out as structured JSON.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  setupApp(app);

  const config = app.get(ConfigService<AppConfig, true>);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Citewise API')
    .setDescription('Ask your documents questions and get answers with page citations.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    // Keep the token after a page refresh while trying the API in the browser.
    { swaggerOptions: { persistAuthorization: true } },
  );

  await app.listen(config.get('port', { infer: true }));
}
await bootstrap();
