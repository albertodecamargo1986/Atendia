-- AtendIA — Init script for PostgreSQL + pgvector
-- Runs automatically on first docker-compose up

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
