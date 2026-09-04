import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** 通用模态框：Esc 关闭、点遮罩关闭、焦点陷阱由 :focus-visible 兜底 */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="row-between" style={{ marginBottom: "var(--sp-5)" }}>
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>
        {children}
        {footer && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--sp-5)", gap: "var(--sp-3)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
