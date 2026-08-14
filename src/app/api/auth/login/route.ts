import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.status || 401 })
    }

    return NextResponse.json({
      success: true,
      account: { id: data.user.id, email: data.user.email },
    })
  }
 catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
