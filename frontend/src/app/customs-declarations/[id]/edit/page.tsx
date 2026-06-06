'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function EditCustomsDeclarationRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/dashboard/customs-declarations/${id}/edit`);
    }
  }, [id, router]);

  return null;
}
