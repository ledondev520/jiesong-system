import { NextResponse } from 'next/server';
import { getDevCockpitSnapshot } from '@/lib/dev-cockpit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = getDevCockpitSnapshot();

  return NextResponse.json(snapshot, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
