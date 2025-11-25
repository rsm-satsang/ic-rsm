-- Add intake_completed flag to projects metadata
-- This will be a JSONB field so we can store it without altering the table structure

-- No schema changes needed - we'll use the existing metadata field
-- Just documenting that metadata will contain: { intake_completed: boolean, vocabulary: string[] }

-- Add a helper function to augment v1 version with new references
CREATE OR REPLACE FUNCTION append_to_v1_version(
  _project_id UUID,
  _new_content TEXT,
  _source_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v1_version_id UUID;
  _current_content TEXT;
  _updated_content TEXT;
BEGIN
  -- Find the v1 Raw version (lowest version number, typically 1)
  SELECT id, content INTO _v1_version_id, _current_content
  FROM versions
  WHERE project_id = _project_id
    AND (title ILIKE '%raw%' OR title ILIKE '%v1%' OR version_number = 1)
  ORDER BY version_number ASC
  LIMIT 1;

  -- If v1 exists, append new content
  IF _v1_version_id IS NOT NULL THEN
    _updated_content := _current_content || E'\n\n=== BEGIN SOURCE: ' || _source_name || E' ===\n' || _new_content || E'\n=== END SOURCE: ' || _source_name || E' ===';
    
    UPDATE versions
    SET content = _updated_content,
        updated_at = NOW()
    WHERE id = _v1_version_id;
  END IF;

  RETURN _v1_version_id;
END;
$$;