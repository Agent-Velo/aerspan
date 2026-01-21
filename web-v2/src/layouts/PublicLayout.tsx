import { Outlet } from 'react-router-dom';
import { Header } from '@/layouts/Header';
import { getFooterHtml } from '@/lib/branding';

export function PublicLayout() {
  const footerHtml = getFooterHtml();
  return (
    <div className='min-h-screen'>
      <Header />
      <main className='mx-auto w-full max-w-7xl px-4 py-6'>
        <Outlet />
      </main>
      <footer className='app-footer px-4 py-6 text-sm'>
        <div
          className='mx-auto w-full max-w-7xl'
          dangerouslySetInnerHTML={{ __html: footerHtml }}
        />
      </footer>
    </div>
  );
}
