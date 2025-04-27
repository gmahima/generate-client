-- Add client-related columns to spec_versions
ALTER TABLE IF EXISTS spec_versions
ADD COLUMN IF NOT EXISTS client_code TEXT,
ADD COLUMN IF NOT EXISTS client_ready BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Create trigger function for client_ready
CREATE OR REPLACE FUNCTION handle_client_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.client_ready = TRUE AND OLD.client_ready = FALSE) THEN
    -- This will call our publish-client function when client_ready becomes true
    PERFORM http_post(
      'https://zlinuxwstcbhijwmntdl.supabase.co/functions/v1/publish-client',
      json_build_object('spec_id', NEW.id, 'project_id', NEW.project_id),
      'application/json',
      json_build_object('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsaW51eHdzdGNiaGlqd21udGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTM4MTk4NzEsImV4cCI6MjAyOTM5NTg3MX0.2jwJAG3yyozxCp1tfE3uuV7eFdpCoSP4_F44bZGhBHk')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_client_ready ON spec_versions;

-- Create the trigger
CREATE TRIGGER on_client_ready
AFTER UPDATE ON spec_versions
FOR EACH ROW
WHEN (NEW.client_ready = TRUE AND OLD.client_ready = FALSE)
EXECUTE FUNCTION handle_client_ready(); 