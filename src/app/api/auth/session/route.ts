import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      account: { id: user.id, email: user.email },
    })
  } catch (err) {
    console.error('Session error:', err)
    return NextResponse.json({ error: 'Session check failed' }, { status: 500 })
  }
}
