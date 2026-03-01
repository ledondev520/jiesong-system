'use client';

import { Suspense } from 'react';
import SettingsPageContent from './components/SettingsPageContent';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
