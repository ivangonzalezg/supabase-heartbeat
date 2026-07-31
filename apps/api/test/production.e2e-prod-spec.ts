import { existsSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AppModule as AppModuleType } from './../src/app.module';
import type { HealthStatus } from './../src/modules/health/health.controller';

// Resolved from the process cwd (apps/api, where this suite always runs
// from via the workspace script), not __dirname/import.meta: this file
// runs under ts-jest's ESM transform, and neither symbol is usable in a
// way that also works under the plain CJS Jest config other suites use.
const webDistPath = join('..', 'web', 'dist');

if (!existsSync(webDistPath)) {
  throw new Error(
    `Web build not found at ${webDistPath}. Run ` +
      '"yarn workspace @supabase-heartbeat/api test:e2e:prod", which builds the web app first.',
  );
}

describe('Production frontend hosting (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // NODE_ENV must be 'production' before `AppModule` is loaded, since its
    // FrontendModule import is decided once, at module-evaluation time. A
    // dynamic import (rather than a static top-of-file import, which is
    // still hoisted above this assignment even under ESM) ensures that
    // ordering.
    //
    // The app is also bootstrapped with the real `NestFactory.create()`
    // (as `main.ts` does), not `Test.createTestingModule()`: the latter
    // attaches the HTTP adapter only after module instantiation, which
    // makes `@nestjs/serve-static` resolve its Express loader too late.
    process.env.NODE_ENV = 'production';

    const appModuleExports = (await import('./../src/app.module.js')) as {
      AppModule: typeof AppModuleType;
    };
    const { AppModule } = appModuleExports;

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.NODE_ENV;
  });

  it('GET /api/health returns JSON', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect('Content-Type', /json/);
    const body = response.body as HealthStatus;

    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /api/does-not-exist returns a JSON 404, not HTML', () => {
    return request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404)
      .expect('Content-Type', /json/);
  });

  it('GET / returns the compiled frontend index.html', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('GET /projects/example falls back to index.html for SPA routes', () => {
    return request(app.getHttpServer())
      .get('/projects/example')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('GET /favicon.svg serves the physical static asset', () => {
    return request(app.getHttpServer())
      .get('/favicon.svg')
      .expect(200)
      .expect('Content-Type', /svg/);
  });
});
