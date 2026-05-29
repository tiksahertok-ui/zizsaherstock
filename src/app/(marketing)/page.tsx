'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  BarChart3,
  LineChart,
  Gem,
  DollarSign,
  Activity,
  Clock,
  TrendingUp,
  Star,
  Check,
  ArrowRight,
  Menu,
  X,
  Sun,
  Moon,
  Shield,
  Zap,
  PieChart,
  ArrowUpRight,
  Users,
  Globe,
  ChevronRight,
  Quote,
  Layers,
  Search,
  Plus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

// ── Animation Helpers ──────────────────────────────────────────

function FadeIn({
  children,
  className,
  delay = 0,
  direction = 'up',
  duration = 0.5,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
}) {
  const dirMap = {
    up: { y: 24, x: 0 },
    down: { y: -24, x: 0 },
    left: { x: 24, y: 0 },
    right: { x: -24, y: 0 },
  };
  const offset = dirMap[direction];

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

function StaggerContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1 } },
      }}
    >
      {children}
    </motion.div>
  );
}

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

// ── Counter Animation ─────────────────────────────────────────

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

// ── Navbar ─────────────────────────────────────────────────────

function Navbar() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-background/80 backdrop-blur-xl border-b shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm group-hover:shadow-emerald-500/25 transition-shadow">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-tight">
              EGX <span className="text-emerald-600 dark:text-emerald-400">Portfolio</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="rounded-full"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">Log In</Link>
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              asChild
            >
              <Link href="/dashboard">Get Started</Link>
            </Button>
          </div>

          {/* Mobile Menu */}
          <div className="flex md:hidden items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="rounded-full"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    EGX Portfolio
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 mt-6">
                  {navLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {link.label}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </a>
                  ))}
                  <Separator className="my-3" />
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard" onClick={() => setMobileOpen(false)}>Log In</Link>
                  </Button>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-1"
                    asChild
                  >
                    <Link href="/dashboard" onClick={() => setMobileOpen(false)}>Get Started</Link>
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Hero Section ───────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-emerald-500/20 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-emerald-600/15 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-400/5 blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-32">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <FadeIn delay={0}>
            <Badge
              variant="outline"
              className="mb-6 px-4 py-1.5 text-sm font-medium border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50"
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              The #1 Egyptian Investment Tracker
            </Badge>
          </FadeIn>

          {/* English Headline */}
          <FadeIn delay={0.1}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Track Your Egyptian
              <br />
              Investments{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
                Like a Pro
              </span>
            </h1>
          </FadeIn>

          {/* Arabic Subtitle */}
          <FadeIn delay={0.2}>
            <p
              className="mt-4 text-xl sm:text-2xl md:text-3xl font-medium text-muted-foreground"
              dir="rtl"
              lang="ar"
            >
              تتبع استثماراتك المصرية كالمحترفين
            </p>
          </FadeIn>

          {/* Subheadline */}
          <FadeIn delay={0.3}>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Real-time EGX stock data, gold prices in EGP, USD/EGP forex tracking,
              and powerful portfolio analytics — all in one beautiful dashboard.
            </p>
          </FadeIn>

          {/* CTA Buttons */}
          <FadeIn delay={0.4}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 transition-all h-12 px-8 text-base font-semibold"
                asChild
              >
                <Link href="/dashboard">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base font-medium"
                asChild
              >
                <a href="#demo">
                  <Activity className="mr-2 h-4 w-4" />
                  View Demo
                </a>
              </Button>
            </div>
          </FadeIn>

          {/* Stats Bar */}
          <FadeIn delay={0.5}>
            <div className="mt-16 sm:mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto">
              {[
                { value: 220, suffix: '+', label: 'Stocks Tracked' },
                { value: 24, suffix: '/7', label: 'Real-time Gold' },
                { value: 1, suffix: '', label: 'USD/EGP Live' },
                { value: 100, suffix: '%', label: 'Free to Use' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center p-4 rounded-xl bg-muted/30 border border-border/50"
                >
                  <span className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </span>
                  <span className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}

// ── Features Section ───────────────────────────────────────────

const features = [
  {
    icon: BarChart3,
    title: 'Real-time Market Data',
    description:
      'Live EGX indices, stock prices, volume, and market depth updates every 5 seconds during trading hours.',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    icon: PieChart,
    title: 'Portfolio Tracking',
    description:
      'Track P&L, allocation breakdown, performance charts, and transaction history across all your holdings.',
    gradient: 'from-emerald-600 to-emerald-700',
  },
  {
    icon: Gem,
    title: 'Gold Price Tracking',
    description:
      '24K, 21K, 18K gold prices in EGP with daily changes, highs/lows, and gold pound tracking.',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: Activity,
    title: 'Technical Analysis',
    description:
      'Support & resistance levels, moving averages, RSI, MACD, Bollinger Bands, and pivot points.',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    icon: DollarSign,
    title: 'USD/EGP Forex',
    description:
      'Live exchange rate tracking with historical changes, percentage moves, and multi-source data.',
    gradient: 'from-sky-500 to-blue-600',
  },
  {
    icon: Clock,
    title: 'Market Status',
    description:
      'Know exactly when EGX, gold, and forex markets are open or closed with live status indicators.',
    gradient: 'from-rose-500 to-pink-600',
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="secondary" className="mb-4">
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            Features
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Everything You Need to{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
              Trade Smarter
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Comprehensive tools designed specifically for the Egyptian market. All data, all markets, one platform.
          </p>
        </FadeIn>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <motion.div key={feature.title} variants={staggerItem}>
              <Card className="group h-full hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 hover:-translate-y-1 border-border/60 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-sm mb-2`}
                  >
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}

// ── How It Works Section ───────────────────────────────────────

const steps = [
  {
    number: '01',
    title: 'Create Portfolio',
    description:
      'Set up your portfolio in seconds with a simple username. No email or signup required.',
    icon: Users,
  },
  {
    number: '02',
    title: 'Add Positions',
    description:
      'Add your stock holdings with purchase price, shares, and date. We handle the rest.',
    icon: Plus,
  },
  {
    number: '03',
    title: 'Track Performance',
    description:
      'Watch your portfolio grow with real-time P&L, allocation charts, and performance analytics.',
    icon: LineChart,
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="secondary" className="mb-4">
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
            How It Works
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Start Tracking in{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
              3 Simple Steps
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            No complicated setup. Get started in under a minute and start making informed decisions.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-24 left-[20%] right-[20%] h-px bg-gradient-to-r from-emerald-300 via-emerald-500 to-emerald-300 dark:from-emerald-700 dark:via-emerald-500 dark:to-emerald-700" />

          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.15} className="relative">
              <div className="flex flex-col items-center text-center">
                {/* Step number circle */}
                <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-600/20 mb-6">
                  <step.icon className="w-7 h-7 text-white" />
                </div>
                {/* Step number */}
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-widest uppercase mb-2">
                  Step {step.number}
                </span>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                  {step.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Demo Preview Section ───────────────────────────────────────

function DemoPreviewSection() {
  return (
    <section id="demo" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-3xl mx-auto mb-12">
          <Badge variant="secondary" className="mb-4">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Live Preview
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            See Your{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
              Dashboard
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A powerful, real-time dashboard designed for Egyptian investors.
          </p>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="relative">
            {/* Glow behind */}
            <div className="absolute inset-0 bg-emerald-500/10 blur-[80px] rounded-3xl -z-10" />

            {/* Browser window */}
            <div className="rounded-xl border bg-card shadow-2xl overflow-hidden">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground font-mono">
                    <Globe className="w-3 h-3" />
                    egxportfolio.com/dashboard
                  </div>
                </div>
                <div className="w-16" />
              </div>

              {/* Dashboard mockup */}
              <div className="p-4 sm:p-6 space-y-4">
                {/* Top stats row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Value', value: 'EGP 245,830', change: '+2.4%', up: true },
                    { label: "Today's P&L", value: '+EGP 5,720', change: '+2.38%', up: true },
                    { label: 'Total P&L', value: '+EGP 45,830', change: '+22.9%', up: true },
                    { label: 'Gold (24K/g)', value: 'EGP 3,420', change: '+0.8%', up: true },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border bg-muted/30 p-3 sm:p-4"
                    >
                      <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                      <p className="text-sm sm:text-base font-bold mt-1">{stat.value}</p>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {stat.change}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Main content area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Chart placeholder */}
                  <div className="lg:col-span-2 rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-semibold">Portfolio Performance</p>
                        <p className="text-xs text-muted-foreground">Last 30 days</p>
                      </div>
                      <div className="flex gap-1">
                        {['1D', '1W', '1M', '3M', '1Y'].map((p) => (
                          <span
                            key={p}
                            className={`px-2 py-0.5 text-xs rounded font-medium ${
                              p === '1M'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* SVG Chart Line */}
                    <svg
                      viewBox="0 0 600 150"
                      className="w-full h-32 sm:h-40"
                      fill="none"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,120 C50,110 80,95 120,85 C160,75 200,90 240,70 C280,50 320,60 360,40 C400,20 440,35 480,25 C520,15 560,20 600,10"
                        stroke="rgb(16 185 129)"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M0,120 C50,110 80,95 120,85 C160,75 200,90 240,70 C280,50 320,60 360,40 C400,20 440,35 480,25 C520,15 560,20 600,10 L600,150 L0,150 Z"
                        fill="url(#chartGrad)"
                      />
                    </svg>
                  </div>

                  {/* Holdings list */}
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <p className="text-sm font-semibold mb-3">Top Holdings</p>
                    <div className="space-y-3">
                      {[
                        { sym: 'CIB', name: 'Commercial Int.', pnl: '+12.4%', price: 'EGP 78.50' },
                        { sym: 'ORAS', name: 'Orascom Construction', pnl: '+8.2%', price: 'EGP 15.30' },
                        { sym: 'EGID', name: 'Egyptian Int. Hotels', pnl: '-3.1%', price: 'EGP 4.82' },
                        { sym: 'AMZN', name: 'Alexandria Minerals', pnl: '+5.7%', price: 'EGP 22.10' },
                        { sym: 'SWDY', name: 'SODIC', pnl: '+1.3%', price: 'EGP 11.45' },
                      ].map((stock) => (
                        <div key={stock.sym} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">{stock.sym}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{stock.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium">{stock.price}</p>
                            <p
                              className={`text-[10px] font-semibold ${
                                stock.pnl.startsWith('+')
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {stock.pnl}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: BarChart3, label: 'EGX 30', value: '24,580', up: true },
                    { icon: Gem, label: 'Gold 21K/g', value: 'EGP 2,980', up: true },
                    { icon: DollarSign, label: 'USD/EGP', value: '48.50', up: false },
                    { icon: Activity, label: 'Market', value: 'Open', badge: true },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border bg-muted/20 p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground font-medium">{item.label}</p>
                        <p className="text-xs font-bold truncate">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ── Testimonials Section ───────────────────────────────────────

const testimonials = [
  {
    name: 'أحمد محمود',
    role: 'Day Trader, Cairo',
    rating: 5,
    text: 'Best Egyptian stock tracker I\'ve used. The real-time gold prices and USD/EGP rates make it my go-to platform for daily trading decisions.',
    initials: 'أم',
  },
  {
    name: 'سارة حسن',
    role: 'Long-term Investor, Alexandria',
    rating: 5,
    text: 'Finally a portfolio manager that understands the Egyptian market. The technical analysis tools are incredibly helpful for my investment strategy.',
    initials: 'سح',
  },
  {
    name: 'محمد علي',
    role: 'Portfolio Manager, Giza',
    rating: 5,
    text: 'The live data and clean interface set this apart from everything else. I track all my EGX holdings and gold positions in one place. Highly recommended.',
    initials: 'مع',
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-muted text-muted'
          }`}
        />
      ))}
    </div>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-20 sm:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="secondary" className="mb-4">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Testimonials
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Trusted by{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
              Egyptian Investors
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join thousands of investors who track their portfolios with EGX Portfolio.
          </p>
        </FadeIn>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <motion.div key={t.name} variants={staggerItem}>
              <Card className="h-full hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 hover:-translate-y-1">
                <CardContent className="pt-6 flex flex-col h-full">
                  <Quote className="w-8 h-8 text-emerald-200 dark:text-emerald-800 mb-4 flex-shrink-0" />
                  <StarRating rating={t.rating} />
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground flex-1">
                    &ldquo;{t.text}&rdquo;
                  </p>
                  <Separator className="my-4" />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-sm font-bold">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" dir="rtl" lang="ar">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}

// ── Pricing Section ────────────────────────────────────────────

const pricingPlans = [
  {
    name: 'Free',
    price: 'EGP 0',
    period: 'forever',
    description: 'Perfect for getting started with Egyptian market tracking.',
    featured: false,
    cta: 'Get Started Free',
    features: [
      { text: 'Portfolio tracking', included: true },
      { text: 'Real-time stock prices', included: true },
      { text: 'Gold price tracking', included: true },
      { text: 'USD/EGP live rates', included: true },
      { text: 'Basic analysis', included: true },
      { text: 'Technical indicators', included: true },
      { text: 'AI insights', included: false },
      { text: 'Price alerts', included: false },
      { text: 'Advanced charts', included: false },
      { text: 'Priority support', included: false },
      { text: 'Watchlists', included: false },
    ],
  },
  {
    name: 'Pro',
    price: 'EGP 99',
    period: '/month',
    description: 'For serious investors who want the full edge.',
    featured: true,
    cta: 'Coming Soon',
    features: [
      { text: 'Portfolio tracking', included: true },
      { text: 'Real-time stock prices', included: true },
      { text: 'Gold price tracking', included: true },
      { text: 'USD/EGP live rates', included: true },
      { text: 'Basic analysis', included: true },
      { text: 'Technical indicators', included: true },
      { text: 'AI insights', included: true },
      { text: 'Price alerts', included: true },
      { text: 'Advanced charts', included: true },
      { text: 'Priority support', included: true },
      { text: 'Watchlists', included: true },
    ],
  },
];

function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="secondary" className="mb-4">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Pricing
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Simple,{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
              Transparent
            </span>{' '}
            Pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free and upgrade when you need advanced features.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {pricingPlans.map((plan, i) => (
            <FadeIn key={plan.name} delay={i * 0.15}>
              <Card
                className={`h-full relative overflow-hidden ${
                  plan.featured
                    ? 'border-emerald-300 dark:border-emerald-700 shadow-xl shadow-emerald-600/10'
                    : ''
                }`}
              >
                {plan.featured && (
                  <div className="absolute top-0 right-0 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm ml-1">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1">
                  <div className="space-y-3 flex-1">
                    {plan.features.map((feature) => (
                      <div key={feature.text} className="flex items-center gap-3">
                        {feature.included ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <X className="w-3 h-3 text-muted-foreground" />
                          </div>
                        )}
                        <span
                          className={`text-sm ${
                            feature.included ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {feature.text}
                        </span>
                        {!feature.included && plan.name === 'Pro' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
                            Soon
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    className={`w-full mt-6 h-11 ${
                      plan.featured
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25'
                        : ''
                    }`}
                    variant={plan.featured ? 'default' : 'outline'}
                    asChild={!plan.featured}
                  >
                    {plan.featured ? (
                      plan.cta
                    ) : (
                      <Link href="/dashboard">{plan.cta}</Link>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQ Section ────────────────────────────────────────────────

const faqs = [
  {
    question: 'Is the platform free?',
    answer:
      'Yes! The core platform is completely free to use. You get portfolio tracking, real-time stock prices, gold tracking, USD/EGP rates, and basic technical analysis — all at no cost. We also offer a Pro plan with advanced features coming soon.',
  },
  {
    question: 'Which markets are supported?',
    answer:
      'We support the Egyptian Exchange (EGX) with 220+ stocks across all sectors. Additionally, we track gold prices (24K, 21K, 18K in EGP) and the USD/EGP exchange rate. All data is sourced from official Egyptian market feeds.',
  },
  {
    question: 'How often are prices updated?',
    answer:
      'Stock prices and indices are updated every 5 seconds during EGX trading hours (Sunday–Thursday, 9:30 AM – 3:00 PM Cairo time). Gold and forex data is refreshed every 60 seconds, available 24/7.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. Your portfolio data is stored locally on your device using localStorage. No financial data is sent to external servers beyond what is needed to fetch market data. We never share your information with third parties.',
  },
  {
    question: 'Can I use it on mobile?',
    answer:
      'Yes! EGX Portfolio is fully responsive and works beautifully on any device — smartphones, tablets, laptops, and desktops. Simply open the website in your mobile browser for the best experience.',
  },
  {
    question: 'Do you support paper trading?',
    answer:
      'Paper trading (simulated trading without real money) is on our roadmap for the Pro plan. You\'ll be able to practice strategies and test ideas risk-free with virtual cash and real market data.',
  },
];

function FAQSection() {
  return (
    <section id="faq" className="py-20 sm:py-24 bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            <Search className="w-3.5 h-3.5 mr-1.5" />
            FAQ
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Frequently Asked{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
              Questions
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to know about EGX Portfolio.
          </p>
        </FadeIn>

        <FadeIn delay={0.2}>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm sm:text-base font-medium hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeIn>
      </div>
    </section>
  );
}

// ── CTA Section ────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="relative rounded-2xl overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-800 dark:from-emerald-700 dark:to-emerald-950" />
            <div className="absolute inset-0 opacity-10">
              <div
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
                className="absolute inset-0"
              />
            </div>

            <div className="relative px-6 sm:px-12 py-16 sm:py-20 text-center">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                Ready to Start Tracking?
              </h2>
              <p
                className="mt-4 text-lg text-emerald-100/80 max-w-xl mx-auto"
                dir="rtl"
                lang="ar"
              >
                ابدأ الآن مجاناً وتابع استثماراتك بذكاء
              </p>
              <p className="mt-2 text-base text-emerald-100/60 max-w-xl mx-auto">
                Join thousands of Egyptian investors. No credit card required.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-xl h-12 px-8 text-base font-semibold"
                  asChild
                >
                  <Link href="/dashboard">
                    Get Started Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 px-8 text-base font-medium border-white/30 text-white hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <a href="#features">Learn More</a>
                </Button>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────

function Footer() {
  const footerLinks = {
    Product: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Live Demo', href: '#demo' },
      { label: 'FAQ', href: '#faq' },
    ],
    Markets: [
      { label: 'EGX Stocks', href: '#' },
      { label: 'Gold Prices', href: '#' },
      { label: 'USD/EGP Forex', href: '#' },
      { label: 'Market Status', href: '#' },
    ],
    Company: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contact', href: '#' },
      { label: 'Privacy', href: '#' },
    ],
  };

  return (
    <footer className="border-t bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">
                EGX <span className="text-emerald-600 dark:text-emerald-400">Portfolio</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              The most comprehensive Egyptian investment tracking platform. Monitor your EGX stocks,
              gold, and forex in real-time.
            </p>
            <p className="mt-2 text-sm text-muted-foreground" dir="rtl" lang="ar">
              منصة تتبع الاستثمارات المصرية الأكثر شمولاً
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-4">{category}</h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} EGX Portfolio Tracker. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {/* Social icons as simple links */}
            {['X', 'LinkedIn', 'GitHub'].map((social) => (
              <a
                key={social}
                href="#"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function MarketingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <DemoPreviewSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
