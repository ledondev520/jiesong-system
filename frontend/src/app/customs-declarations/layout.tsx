import DashboardLayout from '@/app/dashboard/layout';

export default function CustomsDeclarationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
