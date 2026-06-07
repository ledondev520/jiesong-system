'use client';

import { useEffect, type ReactNode } from 'react';
import { clearLegacyQuickLoginState } from '@/lib/legacy-auth-cleanup';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    clearLegacyQuickLoginState();
  }, []);

  return children;
}
