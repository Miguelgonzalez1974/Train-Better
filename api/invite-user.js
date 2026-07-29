import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'miguelg.rincon@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' });
    return;
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || userData?.user?.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Solo el administrador puede invitar usuarios.' });
    return;
  }

  const { email, redirectTo } = req.body || {};
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email requerido.' });
    return;
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo || SUPABASE_URL,
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ success: true });
}
