'use client';

import { useTheme } from 'next-themes';
import {
  CandlestickChart,
  RefreshCw,
  Plus,
  Sun,
  Moon,
  LogOut,
  Mail,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type Profile = {
  id: string;
  email: string;
};

interface DashboardHeaderProps {
  profile: Profile | null;
  onRefresh: () => void;
  onAddPosition: () => void;
  onLogout: () => void;
  refreshing: boolean;
}

export function DashboardHeader({
  profile,
  onRefresh,
  onAddPosition,
  onLogout,
  refreshing,
}: DashboardHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm">
            <CandlestickChart className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-lg tracking-tight">
            EGX <span className="text-emerald-600 dark:text-emerald-400">Portfolio</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {profile && (
            <>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border text-sm">
                <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium truncate max-w-[180px]">{profile.email}</span>
              </div>
              <Separator orientation="vertical" className="hidden sm:block h-6" />
            </>
          )}

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

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-full"
            aria-label="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>

          {profile && (
            <Button
              size="sm"
              onClick={onAddPosition}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Add Position</span>
            </Button>
          )}

          {profile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="rounded-full text-muted-foreground hover:text-destructive"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
