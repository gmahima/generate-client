-- Create a table for projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create a table for specifications
CREATE TABLE IF NOT EXISTS specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  file_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_specifications_project_id ON specifications(project_id);

-- Make sure projects have unique names per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_project_name_per_user ON projects(user_id, name);

-- Ensure versions are unique per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_version_per_project ON specifications(project_id, version); 