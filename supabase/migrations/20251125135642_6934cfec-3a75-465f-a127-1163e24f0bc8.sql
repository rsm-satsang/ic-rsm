-- Drop the trigger and function with CASCADE
DROP TRIGGER IF EXISTS on_project_created ON projects CASCADE;
DROP FUNCTION IF EXISTS create_initial_version() CASCADE;