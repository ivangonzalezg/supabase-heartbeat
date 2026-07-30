import { sql } from 'drizzle-orm';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  const originalDatabasePath = process.env.DATABASE_PATH;

  beforeEach(async () => {
    // An in-memory database keeps this test isolated from the developer's
    // real database file and from any other test run.
    process.env.DATABASE_PATH = ':memory:';

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    await module.init();
  });

  afterEach(() => {
    service.onApplicationShutdown();
    process.env.DATABASE_PATH = originalDatabasePath;
  });

  it('opens the database and exposes a Drizzle instance', () => {
    expect(service.db).toBeDefined();
  });

  it('can execute a simple query through Drizzle', () => {
    const result = service.db.get<{ result: number }>(sql`select 1 as result`);

    expect(result).toEqual({ result: 1 });
  });
});
