-- Add user_notes column to reference_files for context/descriptions
ALTER TABLE public.reference_files 
ADD COLUMN IF NOT EXISTS user_notes text;

-- Add comment to explain the column
COMMENT ON COLUMN public.reference_files.user_notes IS 'User-provided context, description, or notes about this reference';