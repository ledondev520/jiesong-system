'use client';

import { useEffect, type ReactNode } from 'react';

const LEGACY_LOGIN_PROFILE_KEYS = ['jiesong_quick_login_profile'];

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    for (const key of LEGACY_LOGIN_PROFILE_KEYS) {
      localStorage.removeItem(key);
    }
  }, []);

  return children;
}
