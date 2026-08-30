import './lib/load-env';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { attachViteDevProxy } from './frontend/vite-dev-proxy';
import { setupSwagger } from './lib/swagger/swagger.config';

const port = process.env.PORT ?? 7854;
const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Better Auth needs the raw request body; @thallesp/nestjs-better-auth
    // re-adds JSON/urlencoded parsing for every other route.
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await setupSwagger(app);

  if (process.env.NODE_ENV !== 'production') {
    attachViteDevProxy(app);

    // The Docker image applies pending migrations from its own entrypoint
    // (see docker-entrypoint.sh) before this process ever starts, so this
    // only runs for `yarn dev` / `nest start` — a fresh checkout's SQLite
    // file otherwise opens with no tables. Idempotent: a no-op once every
    // migration is already applied.
    migrate(app.get(DatabaseService).db, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
    logger.log('Database migrations applied.');
  }

  await app.listen(port, () => {
    logger.log(`Server running on http://localhost:${port}`);
  });
}

void bootstrap();
