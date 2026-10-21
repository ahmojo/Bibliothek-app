"use client";

import { useRef, useState } from "react";
import { requestApi } from "@/lib/frontend.mjs";
import Dialog from "./dialog";
import { Button, FormField, InlineAlert } from "./ui";

export default function UserForm({ user, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [uncertain, setUncertain] = useState(false);
  const sending = useRef(false);
  const creating = !user.id;

  async function save(event) {
    event.preventDefault();
    if (sending.current || uncertain) return;
    const form = new FormData(event.currentTarget);
    const values = {
      name: form.get("name").trim(),
      email: form.get("email").trim().toLowerCase(),
      role: form.get("role"),
    };
    const invalid = {};
    if (!values.name || values.name.includes("\0") || values.name.length > 200) invalid.name = "Bitte gib einen Namen mit höchstens 200 Zeichen ein.";
    if (values.email.length > 254 || values.email.includes("\0") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) invalid.email = "Bitte gib eine gültige E-Mail-Adresse ein.";
    if (!["USER", "ADMIN"].includes(values.role)) invalid.role = "Bitte wähle eine Rolle aus.";
    if (creating) {
      values.password = form.get("password");
      const passwordLength = [...values.password].length;
      if (passwordLength < 12 || passwordLength > 50) invalid.password = "Das Passwort muss zwischen 12 und 50 Zeichen lang sein.";
    }
    setErrors(invalid);
    setError("");
    if (Object.keys(invalid).length) return;

    sending.current = true;
    setBusy(true);
    let confirmed = false;
    try {
      await requestApi(creating ? "/api/admin/users" : `/api/admin/users/${user.id}`, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      confirmed = true;
    } catch (failure) {
      if (failure.status === 409) {
        setErrors({ email: "Diese E-Mail-Adresse wird bereits verwendet." });
      } else {
        setError(failure.message);
      }
      if (failure.uncertain) {
        setUncertain(true);
        setError("Das Speichern konnte nicht bestätigt werden. Schliesse den Dialog und prüfe die Benutzerliste, bevor du erneut speicherst.");
        await onSaved(false);
      }
    } finally {
      if (confirmed) {
        await onSaved();
        onClose();
      }
      sending.current = false;
      setBusy(false);
    }
  }

  return <Dialog title={creating ? "Benutzer hinzufügen" : "Benutzer bearbeiten"} onClose={onClose} busy={busy}>
    <form className="media-form" onSubmit={save} noValidate>
      {error && <InlineAlert>{error}</InlineAlert>}
      <fieldset className="form-fields" disabled={busy || uncertain}>
        <FormField id="user-name" label="Name" name="name" required autoComplete="name" maxLength={200} defaultValue={user.name || ""} error={errors.name} />
        <FormField id="user-email" label="E-Mail-Adresse" name="email" type="email" required autoComplete="email" maxLength={254} defaultValue={user.email || ""} error={errors.email} />
        {creating && <FormField id="user-password" label="Passwort (12–50 Zeichen)" name="password" type="password" required autoComplete="new-password" error={errors.password} />}
        <div className="form-field">
          <label htmlFor="user-role">Rolle <span aria-hidden="true">*</span></label>
          <select id="user-role" name="role" required defaultValue={user.role || "USER"} aria-invalid={errors.role ? true : undefined} aria-describedby={errors.role ? "user-role-error" : undefined}>
            <option value="USER">Benutzer</option>
            <option value="ADMIN">Administrator</option>
          </select>
          {errors.role && <p className="field-error" id="user-role-error">{errors.role}</p>}
        </div>
      </fieldset>
      <div className="dialog-footer">
        <Button type="submit" disabled={busy || uncertain}>{busy ? "Wird gespeichert …" : creating ? "Benutzer hinzufügen" : "Änderungen speichern"}</Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>{uncertain ? "Schliessen" : "Abbrechen"}</Button>
      </div>
    </form>
  </Dialog>;
}
