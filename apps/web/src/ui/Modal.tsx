import { useEffect, useRef } from 'react';

/** Dialog with focus trap, Escape to close, and focus restored to the opener. */
export function Modal({
  children,
  onClose,
  titleId,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClose: () => void;
  titleId?: string;
  ariaLabel?: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // callers pass inline lambdas; depending on them would refocus on every keystroke

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    const el = modalRef.current;
    if (!el) return;

    const getFocusables = () =>
      el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

    const focusables = getFocusables();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      el.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const currentFocusables = getFocusables();
        if (currentFocusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === el) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus?.();
    };
  }, []);

  return (
    <div
      ref={modalRef}
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={ariaLabel}
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === modalRef.current) closeRef.current();
      }}
    >
      {children}
    </div>
  );
}
