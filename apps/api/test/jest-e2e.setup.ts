// Keeps e2e runs from touching the developer's real SQLite file.
process.env.DATABASE_PATH = ':memory:';
