import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0 print:hidden"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon =
              toast.variant === 'success'
                ? CheckCircle2
                : toast.variant === 'error'
                  ? AlertCircle
                  : Info;
            const borderColor =
              toast.variant === 'success'
                ? 'border-emerald-500/40'
                : toast.variant === 'error'
                  ? 'border-red-500/40'
                  : 'border-blue-500/40';
            const iconColor =
              toast.variant === 'success'
                ? 'text-emerald-400'
                : toast.variant === 'error'
                  ? 'text-red-400'
                  : 'text-cyan-400';

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className={`pointer-events-auto flex items-start gap-3 rounded-lg bg-[#151F32] border ${borderColor} px-4 py-3 shadow-xl text-sm text-slate-100`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                <p className="flex-1 leading-snug">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-0.5"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
