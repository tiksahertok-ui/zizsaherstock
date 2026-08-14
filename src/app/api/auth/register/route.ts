import { createClient, jsonResponse } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { supabase, collected } = await createClient()
    const { email, password } = await request.json()

    if (!email || !password) {
      return jsonResponse({ error: 'Email and password are required' }, { status: 400 })
    }

    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return jsonResponse({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    if (password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: { data: { portfolio: { holdings: [] } } },
    })

    if (error) {
      return jsonResponse({ error: error.message, detail: error.code }, { status: error.status || 400 }, collected)
    }

    if (!data.user) {
      return jsonResponse({ error: 'Registration failed' }, { status: 500 }, collected)
    }

    return jsonResponse({
      success: true,
      account: { id: data.user.id, email: data.user.email },
      emailConfirmationRequired: !data.user.confirmed_at,
    }, undefined, collected)
  } catch (err) {
    console.error('Register error:', err)
    return jsonResponse({ error: 'Registration failed' }, { status: 500 })
  }
}
