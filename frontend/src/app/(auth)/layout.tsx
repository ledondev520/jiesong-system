'use client';

import { useEffect, type ReactNode } from 'react';
import {
  clearLegacyQuickLoginState,
  LEGACY_AUTH_CLEANUP_INLINE_SCRIPT,
} from '@/lib/legacy-auth-cleanup';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    clearLegacyQuickLoginState();
  }, []);

  return (
    <>
      <script
        id="legacy-auth-cleanup"
        dangerouslySetInnerHTML={{ __html: LEGACY_AUTH_CLEANUP_INLINE_SCRIPT }}
      />
      {children}
    </>
  );
}
