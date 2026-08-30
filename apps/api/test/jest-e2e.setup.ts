// Keeps e2e runs from touching the developer's real SQLite file.
process.env.DATABASE_PATH = ':memory:';

// Isolated test-only values so Better Auth can initialize during e2e runs.
process.env.BETTER_AUTH_URL = 'http://localhost:7854';
process.env.BETTER_AUTH_SECRET = 'test-only-secret-not-for-any-real-use-32c';
