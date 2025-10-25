import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, User as UserIcon, SignOut, MagicWand } from 'phosphor-react';

export default function Header({ onLogout, onToggleDark, isDark, onToggleBg, bgEnabled }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Header now visible even without user (auth page); hide menu in that state.
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/70 backdrop-blur dark:border-neutral-800 dark:bg-black/70">
      <div className="container-responsive flex h-14 items-center justify-between">
        <Link to="/" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-neutral-100">OnePassWord</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleBg}
            className="icon-btn h-9 w-9"
            aria-label="Toggle background animation"
            title={bgEnabled ? 'Disable background animation' : 'Enable background animation'}
          >
            <MagicWand size={20} weight={bgEnabled ? 'fill' : 'bold'} />
          </button>
          <button
            onClick={onToggleDark}
            className="icon-btn h-9 w-9"
            aria-label="Toggle dark mode"
            title="Toggle theme"
          >
            <span className="sr-only">Toggle theme</span>
            <div className={`theme-switch ${isDark ? 'is-dark' : ''}`}>
              <span className="icon-layer sun"><Sun size={18} weight="bold" /></span>
              <span className="icon-layer moon"><Moon size={18} weight="bold" /></span>
            </div>
          </button>
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpen(v => !v)}
                className="btn-ghost h-9 w-10 rounded-md border border-slate-200 dark:border-neutral-700"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open menu"
              >
                <div className="flex flex-col items-center justify-center gap-1">
                  <span className="h-0.5 w-5 bg-slate-700 dark:bg-neutral-300"></span>
                  <span className="h-0.5 w-5 bg-slate-700 dark:bg-neutral-300"></span>
                  <span className="h-0.5 w-5 bg-slate-700 dark:bg-neutral-300"></span>
                </div>
              </button>
              {open && (
                <div
                  role="menu"
                  className="menu-anim absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="px-3 py-2 text-xs text-slate-500 dark:text-neutral-400 truncate">{user.email}</div>
                  <Link
                    to="/profile"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    onClick={() => setOpen(false)}
                  >
                    <UserIcon size={16} weight="bold" aria-hidden="true" />
                    <span className="truncate">Profile</span>
                  </Link>
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={async () => { await signOut(); onLogout && onLogout(); setOpen(false); }}
                    aria-label="Logout"
                    title="Logout"
                  >
                    <SignOut size={16} weight="bold" aria-hidden="true" />
                    <span className="truncate">Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
