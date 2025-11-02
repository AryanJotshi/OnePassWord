import React from 'react';
import Spinner from './Spinner';

// Full-screen loading overlay used while auth/user meta or route-level data is fetching
export default function LoadingOverlay({ message = 'Loading...' }) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/70 dark:bg-black/70 backdrop-blur-sm animate-fade-in" aria-live="polite" aria-busy="true" role="status">
            <div className="flex flex-col items-center gap-4">
                <Spinner size={56} />
                <div className="text-sm font-medium tracking-wide text-slate-700 dark:text-neutral-300">{message}</div>
            </div>
        </div>
    );
}