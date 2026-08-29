import { createClient, jsonResponse } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { supabase, collected } = await createClient()
    const { email, password } = await request.json()

    if (!email || !password) {
      return jsonResponse({ error: 'Email and password are required' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error) {
      return jsonResponse({ error: error.message }, { status: error.status || 401 }, collected)
    }

    return jsonResponse({
      success: true,
      account: { id: data.user.id, email: data.user.email },
    }, undefined, collected)
  } catch (err) {
    console.error('Login error:', err)
    return jsonResponse({ error: 'Login failed' }, { status: 500 })
  }
}
