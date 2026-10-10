import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Keeps a record of what admins do (see db/admin_controls.sql),
// shown under Activity on the admin page: who, what, to which order or
// account, and the outcome. Never throws: failing to write the record must
// not undo or block the action itself.
export async function logAdminAction(adminEmail: string, action: string, target?: string | null, detail?: string | null) {
  try {
    const { error } = await supabaseAdmin.from('admin_actions').insert([
      {
        admin_email: adminEmail,
        action,
        target: target ? target.slice(0, 200) : null,
        detail: detail ? detail.slice(0, 1000) : null,
      },
    ]);
    if (error) console.error('Could not record an admin action:', error.message);
  } catch (err) {
    console.error('Could not record an admin action:', err);
  }
}
