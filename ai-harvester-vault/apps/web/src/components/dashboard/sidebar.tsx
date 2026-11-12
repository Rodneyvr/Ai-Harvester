'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Database,
  Key,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Database as DatabaseIcon,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  open: boolean;
  onToggle: () => void;
  storageUsage: { used: number; total: number };
}

const navigation = [
  { name: 'Command Center', href: 'command-center', icon: LayoutDashboard },
  { name: 'Universal Harvester', href: 'harvester', icon: Search },
  { name: 'Agent Library', href: 'library', icon: Database },
  { name: 'API Vault', href: 'vault', icon: Key },
  { name: 'Sandbox', href: 'sandbox', icon: Terminal },
];

export function Sidebar({ currentView, onViewChange, open, onToggle, storageUsage }: SidebarProps) {
  const percentage = storageUsage.total > 0 ? (storageUsage.used / storageUsage.total) * 100 : 0;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300',
        open ? 'w-64' : 'w-16'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className={cn('flex h-16 items-center justify-between px-4 border-b border-border', !open && 'justify-center')}>
          {open && (
            <Link href="/command-center" className="flex items-center gap-2">
              <DatabaseIcon className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">Harvester Vault</span>
            </Link>
          )}
          {!open && (
            <Link href="/command-center" className="p-2" title="Harvester Vault">
              <DatabaseIcon className="h-5 w-5 text-primary" />
            </Link>
          )}
          <button
            onClick={onToggle}
            className={cn('p-1.5 rounded-md hover:bg-accent transition-colors', !open && 'ml-auto')}
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = currentView === item.href;
            return (
              <Link
                key={item.name}
                href={`/${item.href}`}
                onClick={() => onViewChange(item.href)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  !open && 'justify-center px-2'
                )}
                title={open ? undefined : item.name}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {open && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Storage Usage */}
        {open && (
          <div className="border-t border-border p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Free-Tier DB Storage</span>
              <span>{storageUsage.used} / {storageUsage.total} MB</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  percentage > 80 ? 'bg-destructive' : percentage > 60 ? 'bg-yellow-500' : 'bg-primary'
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {percentage.toFixed(1)}% used • Auto-prunes at 90%
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}