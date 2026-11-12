'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { CommandCenter } from '../command-center/command-center';
import { HarvesterView } from '../harvester/harvester-view';
import { LibraryView } from '../library/library-view';
import { VaultView } from '../vault/vault-view';
import { SandboxView } from '../sandbox/sandbox-view';
import { cn } from '@/lib/utils';

type View = 'command-center' | 'harvester' | 'library' | 'vault' | 'sandbox';

export function Dashboard() {
  const [currentView, setCurrentView] = useState<View>('command-center');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 500 });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        open={sidebarOpen}
        onToggle={setSidebarOpen}
        storageUsage={storageUsage}
      />
      <div className={cn('flex-1 flex flex-col overflow-hidden', sidebarOpen ? 'lg:pl-64' : 'lg:pl-16')}>
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {currentView === 'command-center' && <CommandCenter />}
          {currentView === 'harvester' && <HarvesterView />}
          {currentView === 'library' && <LibraryView />}
          {currentView === 'vault' && <VaultView />}
          {currentView === 'sandbox' && <SandboxView />}
        </main>
      </div>
    </div>
  );
}