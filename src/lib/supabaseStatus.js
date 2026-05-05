import { createClient } from '@supabase/supabase-js'

export const supabaseStatus = createClient(
  'https://axcaxcuojkehuasrstog.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y2F4Y3VvamtlaHVhc3JzdG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzkxNDEsImV4cCI6MjA5MjQ1NTE0MX0.oSqxzEMvGOLZnbkmpEWLMeexfyFnG_QkdeS3wwi7bDM',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
)