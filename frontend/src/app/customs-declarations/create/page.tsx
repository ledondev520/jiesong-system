'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateCustomsDeclarationRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/customs-declarations/create');
  }, [router]);

  return null;
}
