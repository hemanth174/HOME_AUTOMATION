import { supabase } from '@/lib/supabase';

// The signed-in user's JWT protects the Edge Function. The backend rereads
// Supabase itself; this request contains no command or schedule contents.
export async function wakeAutomationScheduler() {
  const { error } = await supabase.functions.invoke('automation-dispatch', {
    body: { refresh: true },
  });
  if (error) console.warn('Automation server wake failed; periodic refresh will retry:', error.message);
}
