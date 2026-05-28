'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Lock, User, ArrowRight, Loader2,
  CandlestickChart, Shield, CheckCircle2,
  Sun, Moon, Eye, EyeOff,
  AtSign, KeyRound, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { useAuthStore } from '@/lib/auth-store';

type AuthMode = 'signin' | 'signup' | 'forgot-password' | 'success';

const FADE_IN = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: 'easeOut' },
};

export default function LoginPage() {
  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { signIn, signUp, resetPassword } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sign In fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up fields
  const [signupEmail, setSignupEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  // Forgot Password fields
  const [forgotEmail, setForgotEmail] = useState('');

  // Refs for auto-focus
  const loginIdRef = useRef<HTMLInputElement>(null);
  const signupEmailRef = useRef<HTMLInputElement>(null);
  const forgotEmailRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount and mode change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mode === 'signin') loginIdRef.current?.focus();
      if (mode === 'signup') signupEmailRef.current?.focus();
      if (mode === 'forgot-password') forgotEmailRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [mode]);

  // Clear error when switching modes (handled inline in handlers)

  // ── Helpers ──
  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // ── Sign In ──
  const handleSignIn = useCallback(async () => {
    setError('');
    const identifier = loginIdentifier.trim();
    const password = loginPassword;

    if (!identifier) { setError('Please enter your email or username'); return; }
    if (!password) { setError('Please enter your password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    const result = await signIn(identifier, password);
    setLoading(false);

    if (result.success) {
      setMode('success');
      toast.success('Welcome back!');
    } else {
      setError(result.error || 'Invalid credentials. Please try again.');
    }
  }, [loginIdentifier, loginPassword, signIn]);

  // ── Sign Up ──
  const handleSignUp = useCallback(async () => {
    setError('');
    const email = signupEmail.trim().toLowerCase();
    const username = signupUsername.trim();
    const password = signupPassword;
    const confirmPassword = signupConfirmPassword;

    if (!email) { setError('Please enter your email address'); return; }
    if (!isValidEmail(email)) { setError('Please enter a valid email address'); return; }
    if (!password) { setError('Please create a password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    const result = await signUp(email, password, username || undefined);
    setLoading(false);

    if (result.success) {
      setMode('success');
      toast.success('Account created successfully!');
    } else {
      setError(result.error || 'Failed to create account');
    }
  }, [signupEmail, signupUsername, signupPassword, signupConfirmPassword, signUp]);

  // ── Forgot Password ──
  const handleForgotPassword = useCallback(async () => {
    setError('');
    const email = forgotEmail.trim().toLowerCase();

    if (!email) { setError('Please enter your email address'); return; }
    if (!isValidEmail(email)) { setError('Please enter a valid email address'); return; }

    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);

    if (result.success) {
      toast.success('Password reset instructions sent to your email');
      setMode('signin');
    } else {
      setError(result.error || 'Failed to send reset instructions');
    }
  }, [forgotEmail, resetPassword]);

  // ── Keyboard handlers ──
  const handleLoginKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSignIn();
  };
  const handleSignupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSignUp();
  };
  const handleForgotKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleForgotPassword();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/30 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      {/* Theme toggle */}
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="rounded-full h-10 w-10 hover:bg-muted/80"
        >
          {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </Button>
      </div>

      {/* Logo / Branding */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mb-6 sm:mb-8 text-center relative z-10"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20 mb-3">
          <CandlestickChart className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
          EGX Portfolio
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track your Egyptian stock portfolio
        </p>
      </motion.div>

      {/* Auth Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 }}
        className="w-full max-w-[400px] relative z-10"
      >
        <Card className="shadow-xl border-border/60 bg-card/80 backdrop-blur-sm">
          <AnimatePresence mode="wait">
            {/* ── Sign In ── */}
            {mode === 'signin' && (
              <motion.div key="signin" {...FADE_IN}>
                <CardHeader className="text-center pb-4 pt-6 px-6">
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    Sign in to your account
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground mt-1">
                    Enter your credentials to continue
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  {/* Email or Username */}
                  <div className="space-y-2">
                    <Label htmlFor="login-id" className="text-sm font-medium">
                      Email or Username
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Mail className="h-4 w-4" />
                      </div>
                      <Input
                        ref={loginIdRef}
                        id="login-id"
                        type="text"
                        placeholder="name@example.com"
                        value={loginIdentifier}
                        onChange={(e) => { setLoginIdentifier(e.target.value); setError(''); }}
                        onKeyDown={handleLoginKeyDown}
                        className="pl-10 h-11 text-sm"
                        autoComplete="email username"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password" className="text-sm font-medium">
                        Password
                      </Label>
                      <button
                        type="button"
                        onClick={() => { setError(''); setMode('forgot-password'); }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-medium hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <Input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={loginPassword}
                        onChange={(e) => { setLoginPassword(e.target.value); setError(''); }}
                        onKeyDown={handleLoginKeyDown}
                        className="pl-10 pr-10 h-11 text-sm"
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 text-sm text-red-600 dark:text-red-400 text-center"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <Button
                    onClick={handleSignIn}
                    disabled={loading || !loginIdentifier.trim() || !loginPassword}
                    className="w-full h-11 text-sm font-medium gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  {/* Divider */}
                  <div className="relative my-2">
                    <Separator />
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                      or
                    </span>
                  </div>

                  {/* Switch to Sign Up */}
                  <p className="text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setError(''); setMode('signup'); }}
                      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-medium hover:underline"
                    >
                      Create one
                    </button>
                  </p>
                </CardContent>
              </motion.div>
            )}

            {/* ── Sign Up ── */}
            {mode === 'signup' && (
              <motion.div key="signup" {...FADE_IN}>
                <CardHeader className="text-center pb-4 pt-6 px-6">
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    Create your account
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground mt-1">
                    Start tracking your portfolio today
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3.5">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-sm font-medium">
                      Email address
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Mail className="h-4 w-4" />
                      </div>
                      <Input
                        ref={signupEmailRef}
                        id="signup-email"
                        type="email"
                        placeholder="name@example.com"
                        value={signupEmail}
                        onChange={(e) => { setSignupEmail(e.target.value); setError(''); }}
                        onKeyDown={handleSignupKeyDown}
                        className="pl-10 h-11 text-sm"
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Username (optional) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-username" className="text-sm font-medium">
                      Username{' '}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <AtSign className="h-4 w-4" />
                      </div>
                      <Input
                        id="signup-username"
                        type="text"
                        placeholder="Choose a username"
                        value={signupUsername}
                        onChange={(e) => { setSignupUsername(e.target.value); setError(''); }}
                        onKeyDown={handleSignupKeyDown}
                        className="pl-10 h-11 text-sm"
                        autoComplete="username"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? 'text' : 'password'}
                        placeholder="Min. 6 characters"
                        value={signupPassword}
                        onChange={(e) => { setSignupPassword(e.target.value); setError(''); }}
                        onKeyDown={handleSignupKeyDown}
                        className="pl-10 pr-10 h-11 text-sm"
                        autoComplete="new-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-confirm" className="text-sm font-medium">
                      Confirm password
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Lock className="h-4 w-4" />
                      </div>
                      <Input
                        id="signup-confirm"
                        type={showSignupConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your password"
                        value={signupConfirmPassword}
                        onChange={(e) => { setSignupConfirmPassword(e.target.value); setError(''); }}
                        onKeyDown={handleSignupKeyDown}
                        className="pl-10 pr-10 h-11 text-sm"
                        autoComplete="new-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSignupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 text-sm text-red-600 dark:text-red-400 text-center"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <Button
                    onClick={handleSignUp}
                    disabled={loading || !signupEmail.trim() || !signupPassword || !signupConfirmPassword}
                    className="w-full h-11 text-sm font-medium gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        Create account
                        <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  {/* Switch to Sign In */}
                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setError(''); setMode('signin'); }}
                      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-medium hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </CardContent>
              </motion.div>
            )}

            {/* ── Forgot Password ── */}
            {mode === 'forgot-password' && (
              <motion.div key="forgot" {...FADE_IN}>
                <CardHeader className="text-center pb-4 pt-6 px-6">
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    Reset your password
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground mt-1">
                    Enter your email and we&apos;ll send you reset instructions
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-sm font-medium">
                      Email address
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Mail className="h-4 w-4" />
                      </div>
                      <Input
                        ref={forgotEmailRef}
                        id="forgot-email"
                        type="email"
                        placeholder="name@example.com"
                        value={forgotEmail}
                        onChange={(e) => { setForgotEmail(e.target.value); setError(''); }}
                        onKeyDown={handleForgotKeyDown}
                        className="pl-10 h-11 text-sm"
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 text-sm text-red-600 dark:text-red-400 text-center"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button
                    onClick={handleForgotPassword}
                    disabled={loading || !forgotEmail.trim()}
                    className="w-full h-11 text-sm font-medium gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send reset link
                        <Mail className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Remember your password?{' '}
                    <button
                      type="button"
                      onClick={() => { setError(''); setMode('signin'); }}
                      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-medium hover:underline"
                    >
                      Back to sign in
                    </button>
                  </p>
                </CardContent>
              </motion.div>
            )}

            {/* ── Success ── */}
            {mode === 'success' && (
              <motion.div key="success" {...FADE_IN}>
                <CardHeader className="text-center pb-4 pt-8 px-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                    className="mx-auto w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3"
                  >
                    <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    Welcome aboard!
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground mt-1">
                    Redirecting to your portfolio...
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-8 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 sm:mt-8 text-center text-xs text-muted-foreground space-y-1.5 relative z-10"
      >
        <p className="text-muted-foreground/60">
          &copy; {new Date().getFullYear()} EGX Portfolio Tracker. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
