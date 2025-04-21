-- Make version optional in specifications table
ALTER TABLE specifications 
ALTER COLUMN version DROP NOT NULL;

-- Update existing NULL values to version 1 (if any exist after making it nullable)
UPDATE specifications 
SET version = 1 
WHERE version IS NULL;

-- Update unique index for version per project to handle NULL values
DROP INDEX IF EXISTS idx_unique_version_per_project;
CREATE UNIQUE INDEX idx_unique_version_per_project ON specifications(project_id, version) 
WHERE version IS NOT NULL; 