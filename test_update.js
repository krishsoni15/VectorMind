const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('Missing env'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: projects, error: err1 } = await supabase.from('nods_project').select('*').limit(1);
  if (err1) { console.error('Error fetching:', err1); return; }
  if (projects.length === 0) { console.log('No projects'); return; }
  const p = projects[0];
  console.log('Project:', p);
  
  const { data, error } = await supabase.from('nods_project').update({ chat_provider: 'gemini' }).eq('id', p.id).select().single();
  if (error) { console.error('Error updating:', error); }
  else { console.log('Updated project:', data); }
}
run();
