"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./ui";

export default function Dialog({ title, onClose, children, busy = false, dismissible = true }) {
  const titleId = useId();
  const dialog = useRef(null);
  const heading = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    element.showModal();
    heading.current.focus();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className="dialog" closedby="none" aria-labelledby={titleId} aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (!busy && dismissible) onClose();
      }}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy && dismissible) onClose(); }}>
      <div className="dialog-heading">
        <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
        <Button variant="text" disabled={busy || !dismissible} onClick={onClose}>Schliessen</Button>
      </div>
      {children}
    </dialog>
  );
}
