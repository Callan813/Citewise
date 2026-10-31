-- A separate database for automated tests, so they can wipe tables freely
-- without touching dev data.
CREATE DATABASE docintel_test;
\connect docintel_test
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
