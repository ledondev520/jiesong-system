import { getDevCockpitSnapshot } from '@/lib/dev-cockpit';
import { DevCockpitClient } from './DevCockpitClient';

export const dynamic = 'force-dynamic';

export default async function DevCockpitPage() {
  const initialSnapshot = getDevCockpitSnapshot();

  return <DevCockpitClient initialSnapshot={initialSnapshot} />;
}
