'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex h-full w-full overflow-hidden rounded-full bg-secondary',
      className
    )}
    {...props}
  >
    <div
      className='overflow-hidden rounded-full bg-primary'
      style={{ width: `${value ?? 0}%` }}
    />
  </div>
));
Progress.displayName = 'Progress';

export { Progress };