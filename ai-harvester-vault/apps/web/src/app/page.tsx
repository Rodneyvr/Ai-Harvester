'use client';

import { useState } from 'react';
import { Providers } from './providers';
import { Dashboard } from '@/components/dashboard/dashboard';

export default function HomePage() {
  return (
    <Providers>
      <Dashboard />
    </Providers>
  );
}