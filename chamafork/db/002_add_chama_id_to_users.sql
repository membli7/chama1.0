-- Migration: add chama_id column to users and backfill from memberships
-- Add the column (nullable temporarily)
ALTER TABLE users ADD COLUMN IF NOT EXISTS chama_id UUID;

-- Populate chama_id for existing users based on memberships (assuming each user belongs to one chama)
UPDATE users u SET chama_id = (
  SELECT m.chama_id FROM memberships m WHERE m.user_id = u.id LIMIT 1
) WHERE EXISTS (
  SELECT 1 FROM memberships m WHERE m.user_id = u.id
);

-- Make the column NOT NULL now that it is populated
ALTER TABLE users ALTER COLUMN chama_id SET NOT NULL;

-- Add foreign key constraint to chamas
ALTER TABLE users ADD CONSTRAINT users_chama_id_fkey FOREIGN KEY (chama_id) REFERENCES chamas(chama_id) ON DELETE CASCADE;

-- Update RLS policies will automatically include this column via existing policy creation.
