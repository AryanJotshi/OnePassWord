// @refresh reset
import { createContext, useContext, useCallback, useMemo, useState } from 'react';

const defaultValue = { showToast: () => { } };
const ToastCtx = createContext(defaultValue);

let idSeq = 1;
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const remove = useCallback((id) => setToasts(ts => ts.filter(t => t.id !== id)), []);

    const showToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = idSeq++;
        setToasts(ts => [...ts, { id, message, type, leaving: false }]);
        if (duration > 0) {
            setTimeout(() => {
                setToasts(ts => ts.map(t => t.id === id ? { ...t, leaving: true } : t));
                setTimeout(() => remove(id), 260);
            }, duration - 260);
        }
        return id;
    }, [remove]);

    const value = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastCtx.Provider value={value}>
            {children}
            <div className="fixed inset-x-0 bottom-2 z-50 pointer-events-none">
                <div className="container-responsive flex flex-col items-end gap-2">
                    {toasts.map(t => (
                        <div key={t.id} className={`toast ${t.leaving ? 'toast-leave' : ''} ${t.type === 'error' ? 'border-red-400 text-red-600 dark:text-red-300' : t.type === 'success' ? 'border-emerald-400 text-emerald-600 dark:text-emerald-300' : ''}`}>
                            <div className="pointer-events-auto">{t.message}</div>
                        </div>
                    ))}
                </div>
            </div>
        </ToastCtx.Provider>
    );
}

export function useToast() { return useContext(ToastCtx); }