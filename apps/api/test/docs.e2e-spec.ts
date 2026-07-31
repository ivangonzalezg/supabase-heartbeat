import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupSwagger } from './../src/lib/swagger/swagger.config';

interface OpenAPIDocument {
  openapi: string;
  paths: Record<string, { [method: string]: { tags?: string[] } }>;
}

describe('API documentation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await setupSwagger(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves a single merged OpenAPI document at /api/openapi.json', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    expect(document.openapi).toBe('3.1.0');
  });

  it('includes the NestJS document paths, tagged as Health', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    expect(document.paths).toHaveProperty('/api/health');
    expect(document.paths['/api/health'].get.tags).toEqual(['Health']);
  });

  it('includes Better Auth paths, prefixed under /api/auth', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;
    const pathKeys = Object.keys(document.paths);

    expect(pathKeys).toEqual(
      expect.arrayContaining([
        '/api/auth/sign-in/email',
        '/api/auth/sign-up/email',
        '/api/auth/get-session',
      ]),
    );
  });

  it('includes representative admin-plugin endpoints from Better Auth', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;
    const pathKeys = Object.keys(document.paths);

    expect(pathKeys.some((path) => path.startsWith('/api/auth/admin/'))).toBe(
      true,
    );
  });

  it('tags core Better Auth operations as Authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    const signInOperation = document.paths['/api/auth/sign-in/email'].post;
    expect(signInOperation.tags).toEqual(['Authentication']);
  });

  it('tags admin-plugin operations as Authentication Admin, as a subcategory', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    const listUsersOperation = document.paths['/api/auth/admin/list-users'].get;
    expect(listUsersOperation.tags).toEqual(['Authentication Admin']);
  });

  it('does not expose the configured secret in the merged document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain(
      process.env.BETTER_AUTH_SECRET,
    );
  });

  it('loads /api/docs as a single-source Scalar page (no document selector)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /html/);
    const body = response.text;

    expect(body).toContain('"url": "/api/openapi.json"');
    expect(body).not.toContain('"sources"');
  });

  it('serves the Scalar standalone bundle used by /api/docs', () => {
    return request(app.getHttpServer())
      .get('/api/docs/scalar-standalone.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
  });

  it('loads the Better Auth reference at /api/auth/reference successfully', () => {
    return request(app.getHttpServer()).get('/api/auth/reference').expect(200);
  });

  it('does not require an authenticated session for any documentation route', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
    await request(app.getHttpServer()).get('/api/auth/reference').expect(200);
  });
});
