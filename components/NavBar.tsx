'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Don't show nav on login or check-in pages
  if (!user || pathname === '/login' || pathname.startsWith('/checkin/')) return null;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  const link = (href: string, label: string) => (
    <Link href={href}
      className={`text-sm transition-colors ${pathname === href || pathname.startsWith(href + '/') ? 'text-white font-semibold' : 'text-gray-300 hover:text-white'}`}>
      {label}
    </Link>
  );

  return (
    <nav className="bg-gray-800 text-white px-6 py-3 flex items-center gap-6">
      <Link href="/" className="font-semibold hover:text-gray-300 shrink-0">SAR Manager</Link>
      {link('/operations', 'Operations')}
      {link('/personnel', 'Personnel')}
      {link('/equipment', 'Equipment')}
      {link('/settings', 'Settings')}
      <div className="ml-auto flex items-center gap-4">
        {link('/logs', 'Logs')}
        <span className="text-xs text-gray-400">{user.displayName ?? user.username}</span>
        <button onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  );
}
