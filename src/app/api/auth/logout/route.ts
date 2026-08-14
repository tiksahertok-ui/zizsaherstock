import { createClient, jsonResponse } from '@/lib/supabase/server'

export async function POST() {
  try {
    const { supabase, collected } = await createClient()
    await supabase.auth.signOut()
    return jsonResponse({ success: true }, undefined, collected)
  } catch (err) {
    console.error('Logout error:', err)
    return jsonResponse({ error: 'Logout failed' }, { status: 500 })
  }
}
