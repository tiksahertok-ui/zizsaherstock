import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: { data: { portfolio: { holdings: [] } } },
    })

    if (error) {
      return NextResponse.json({ error: error.message, detail: error.code }, { status: error.status || 400 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      account: { id: data.user.id, email: data.user.email },
      emailConfirmationRequired: !data.user.confirmed_at,
    })
  }
 catch (err) {
    console.error('Register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
