import { createClient, jsonResponse } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { supabase, collected } = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return jsonResponse({ authenticated: false }, { status: 401 }, collected)
    }

    return jsonResponse({
      authenticated: true,
      account: { id: user.id, email: user.email },
    }, undefined, collected)
  } catch (err) {
    console.error('Session error:', err)
    return jsonResponse({ error: 'Session check failed' }, { status: 500 })
  }
}
