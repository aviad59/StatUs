-- pgvector, for character_memories.embedding. Supabase keeps extensions in the
-- `extensions` schema, which is on the default search_path.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
