import { redirect } from 'next/navigation';

export default function CreateCustomsDeclarationRedirectPage() {
  redirect('/dashboard/customs/new');
}
