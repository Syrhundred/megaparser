import Sidebar from '@/components/Sidebar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="ml-60 min-h-screen">{children}</main>
    </>
  );
}
