import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupSwagger } from './../src/lib/swagger/swagger.config';

interface OpenAPISchemaObject {
  type?: string;
  properties?: Record<string, OpenAPISchemaObject>;
  required?: string[];
  oneOf?: { $ref?: string }[];
  format?: string;
  $ref?: string;
}

interface OpenAPIOperation {
  tags?: string[];
  requestBody?: {
    content?: { 'application/json'?: { schema?: OpenAPISchemaObject } };
  };
  responses?: Record<string, { content?: unknown }>;
}

interface OpenAPIDocument {
  openapi: string;
  paths: Record<string, { [method: string]: OpenAPIOperation }>;
  components: { schemas: Record<string, OpenAPISchemaObject> };
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

  it('still documents /api/auth/sign-up/email even though public signup is disabled', async () => {
    // emailAndPassword.disableSignUp only changes the route's runtime
    // behavior (a 400 at request time); it does not remove the route from
    // Better Auth's generated OpenAPI schema. This documents that gap
    // explicitly rather than silently relying on it (see
    // apps/api/README.md, "First-administrator bootstrap").
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    expect(document.paths).toHaveProperty('/api/auth/sign-up/email');
  });

  it('documents the admin-plugin user-creation endpoint used for administrator-created accounts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    expect(document.paths).toHaveProperty('/api/auth/admin/create-user');
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

  it("disables Better Auth's own reference page, so /api/docs is the single entry point", () => {
    return request(app.getHttpServer()).get('/api/auth/reference').expect(404);
  });

  it('does not require an authenticated session for any documentation route', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
  });

  describe('workflow-step configuration documentation', () => {
    const STEP_CONFIGURATION_SCHEMA_NAMES = [
      'SigninStepConfigurationDto',
      'SignoutStepConfiguration',
      'WaitStepConfigurationDto',
      'InsertStepConfigurationDto',
      'ReadStepConfigurationDto',
      'UpdateStepConfigurationDto',
      'DeleteStepConfigurationDto',
      'InvokeFunctionStepConfigurationDto',
    ];

    async function fetchDocument(): Promise<OpenAPIDocument> {
      const response = await request(app.getHttpServer())
        .get('/api/openapi.json')
        .expect(200);
      return response.body as OpenAPIDocument;
    }

    it('registers a schema model for every workflow-step configuration type', async () => {
      const document = await fetchDocument();

      for (const name of STEP_CONFIGURATION_SCHEMA_NAMES) {
        expect(document.components.schemas).toHaveProperty(name);
      }
    });

    it('exposes email and password on the signin configuration model', async () => {
      const document = await fetchDocument();
      const signin = document.components.schemas.SigninStepConfigurationDto;

      expect(signin.properties).toHaveProperty('email');
      expect(signin.properties).toHaveProperty('password');
    });

    it('requires both email and password on the signin configuration model', async () => {
      const document = await fetchDocument();
      const signin = document.components.schemas.SigninStepConfigurationDto;

      expect(signin.required).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });

    it('marks the signin password field with the password OpenAPI format', async () => {
      const document = await fetchDocument();
      const password =
        document.components.schemas.SigninStepConfigurationDto.properties
          ?.password;

      expect(password?.format).toBe('password');
    });

    it('references type-specific configuration schemas from workflow creation (CreateWorkflowStepDto)', async () => {
      const document = await fetchDocument();
      const createStep = document.components.schemas.CreateWorkflowStepDto;
      const refs = (createStep.properties?.configuration?.oneOf ?? []).map(
        (entry) => entry.$ref,
      );

      expect(refs).toEqual(
        expect.arrayContaining(
          STEP_CONFIGURATION_SCHEMA_NAMES.map(
            (name) => `#/components/schemas/${name}`,
          ),
        ),
      );
    });

    it('references type-specific configuration schemas from individual step creation', async () => {
      const document = await fetchDocument();
      const operation =
        document.paths['/api/projects/{projectId}/workflows/{workflowId}/steps']
          .post;
      const schema =
        operation.requestBody?.content?.['application/json']?.schema;

      expect(schema?.$ref).toBe('#/components/schemas/CreateWorkflowStepDto');
    });

    it("documents the workflow detail response's step configuration shapes", async () => {
      const document = await fetchDocument();
      const stepResponse = document.components.schemas.WorkflowStepResponseDto;
      const refs = (stepResponse.properties?.configuration?.oneOf ?? []).map(
        (entry) => entry.$ref,
      );

      expect(document.components.schemas).toHaveProperty(
        'WorkflowDetailResponseDto',
      );
      expect(refs).toEqual(
        expect.arrayContaining(
          STEP_CONFIGURATION_SCHEMA_NAMES.map(
            (name) => `#/components/schemas/${name}`,
          ),
        ),
      );
    });

    it('documents the step list/read response shape', async () => {
      const document = await fetchDocument();

      expect(document.components.schemas).toHaveProperty(
        'WorkflowStepResponseDto',
      );
    });

    it('does not include a literal password value anywhere in the document', async () => {
      const document = await fetchDocument();
      const serialized = JSON.stringify(document);

      expect(serialized).not.toContain('test-password');
      expect(serialized).not.toContain('correct-horse-battery-staple');
    });

    it('remains valid JSON with the expected top-level OpenAPI shape', async () => {
      const document = await fetchDocument();

      expect(document.openapi).toBe('3.1.0');
      expect(typeof document.paths).toBe('object');
      expect(typeof document.components.schemas).toBe('object');
    });

    it('continues to load /api/docs (Swagger UI) after the schema changes', async () => {
      await request(app.getHttpServer())
        .get('/api/docs')
        .expect(200)
        .expect('Content-Type', /html/);
    });
  });

  it('documents the manual workflow-run endpoint, but no scheduler route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;
    const pathKeys = Object.keys(document.paths);

    // The manual-run endpoint (added in a later task than the
    // execution-foundation module this file originally documented) is
    // expected to exist now — see workflow-runs.e2e-spec.ts for its full
    // coverage. What remains true, and is asserted here, is that no
    // scheduler-specific route has been added: manual execution is the
    // only trigger implemented so far.
    expect(document.paths).toHaveProperty(
      '/api/projects/{projectId}/workflows/{workflowId}/runs',
    );

    const schedulerLikePaths = pathKeys.filter((path) =>
      /schedule|cron-trigger|scheduler/i.test(path),
    );
    expect(schedulerLikePaths).toEqual([]);
  });
});
