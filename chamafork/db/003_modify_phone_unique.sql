-- Migration: change global phone UNIQUE to per-chama uniqueness
-- Drop the old unique constraint on phone (PostgreSQL default name users_phone_key)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
-- Add a composite unique constraint on (chama_id, phone)
ALTER TABLE users ADD CONSTRAINT users_chama_id_phone_key UNIQUE (chama_id, phone);
