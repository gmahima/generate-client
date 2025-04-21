-- Create a table to store specification history
CREATE TABLE IF NOT EXISTS public.specification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specification_id UUID NOT NULL REFERENCES public.specifications(id) ON DELETE CASCADE,
    file_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    
    -- Create an index for faster lookups by specification_id
    CONSTRAINT fk_specification FOREIGN KEY (specification_id) REFERENCES public.specifications(id)
);

CREATE INDEX idx_specification_history_spec_id ON public.specification_history(specification_id);

-- Create a function to automatically store specification history
CREATE OR REPLACE FUNCTION store_specification_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.file_content <> NEW.file_content) THEN
        -- Store the old version in history
        INSERT INTO public.specification_history (specification_id, file_content)
        VALUES (OLD.id, OLD.file_content);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically store specification history
DROP TRIGGER IF EXISTS specification_history_trigger ON public.specifications;
CREATE TRIGGER specification_history_trigger
BEFORE UPDATE ON public.specifications
FOR EACH ROW
EXECUTE FUNCTION store_specification_history();

-- Function to get the most recent previous specification version
CREATE OR REPLACE FUNCTION get_previous_specification(spec_id UUID)
RETURNS TEXT AS $$
DECLARE
    previous_content TEXT;
BEGIN
    SELECT file_content INTO previous_content
    FROM public.specification_history
    WHERE specification_id = spec_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN previous_content;
END;
$$ LANGUAGE plpgsql; 