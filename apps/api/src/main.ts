import './lib/load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { attachViteDevProxy } from './frontend/vite-dev-proxy';

const port = process.env.PORT ?? 3000;
const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Better Auth needs the raw request body; @thallesp/nestjs-better-auth
    // re-adds JSON/urlencoded parsing for every other route.
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Supabase Heartbeat API')
    .setDescription('API for managing Supabase Heartbeat.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: 'api/openapi.json',
  });

  if (process.env.NODE_ENV !== 'production') {
    attachViteDevProxy(app);
  }

  await app.listen(port, () => {
    logger.log(`Server running on http://localhost:${port}`);
  });
}

void bootstrap();
