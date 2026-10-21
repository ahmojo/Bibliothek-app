"use client";

import { useEffect, useRef } from "react";
import { Button } from "./ui";

export default function Dialog({ title, onClose, children }) {
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
    <dialog ref={dialog} className="dialog" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-heading">
        <h2 id="dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
        <Button variant="text" onClick={onClose}>Schliessen</Button>
      </div>
      {children}
    </dialog>
  );
}
