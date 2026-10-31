import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCustomsDeclarationRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/customs/${encodeURIComponent(id)}/edit`);
}
