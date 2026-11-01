"use client";
import { useState } from "react";
import {
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, type Auth, type User,
} from "firebase/auth";
import s from "./team.module.css";

// Email/password sign-in for the grinflow team (Firebase Auth). Creating an account is open, but the server
// only shows contact data and lets you verify once your email is verified AND on the team list.

const ERR: Record<string, string> = {
  "auth/invalid-credential": "correo o contraseña incorrectos.",
  "auth/invalid-email": "ese correo no es válido.",
  "auth/email-already-in-use": "ya hay una cuenta con ese correo. entra o recupera tu contraseña.",
  "auth/weak-password": "la contraseña necesita al menos 6 caracteres.",
  "auth/too-many-requests": "demasiados intentos. espera unos minutos.",
  "auth/operation-not-allowed": "el acceso con correo y contraseña no está activado en firebase.",
  "auth/network-request-failed": "sin conexión con firebase.",
};
const message = (e: unknown) => ERR[(e as { code?: string })?.code ?? ""] ?? "no se pudo. intenta de nuevo.";

export function TeamSignIn({ auth, user, onChange }: { auth: Auth; user: User | null; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function run(fn: () => Promise<string | void>) {
    setBusy(true); setNote("");
    try { const n = await fn(); if (n) setNote(n); onChange(); }
    catch (e) { setNote(message(e)); }
    finally { setBusy(false); }
  }

  if (user) return <div className={s.bar}>
    <span className={s.who}>{user.email}{user.emailVerified ? "" : " · sin verificar"}</span>
    {!user.emailVerified && <>
      <button className="secondary" disabled={busy} onClick={() => run(async () => { await sendEmailVerification(user); return "te mandamos el enlace de verificación."; })}>reenviar verificación</button>
      <button className="secondary" disabled={busy} onClick={() => run(async () => { await user.reload(); await user.getIdToken(true); })}>ya verifiqué</button>
    </>}
    <button className="secondary" disabled={busy} onClick={() => run(() => signOut(auth))}>salir</button>
    {note && <p className={s.note} role="status">{note}</p>}
  </div>;

  return <form className={s.bar} onSubmit={e => { e.preventDefault(); run(async () => { await signInWithEmailAndPassword(auth, email.trim(), password); }); }}>
    <input type="email" autoComplete="email" placeholder="correo del equipo" value={email} onChange={e => setEmail(e.target.value)} aria-label="correo" required/>
    <input type="password" autoComplete="current-password" placeholder="contraseña" value={password} onChange={e => setPassword(e.target.value)} aria-label="contraseña" required minLength={6}/>
    <button className="primary" type="submit" disabled={busy}>entrar</button>
    <button className="secondary" type="button" disabled={busy || !email || password.length < 6} onClick={() => run(async () => {
      const { user: u } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(u);
      return "cuenta creada. abre el enlace que te mandamos por correo para verificarla.";
    })}>crear cuenta</button>
    <button className="link" type="button" disabled={busy || !email} onClick={() => run(async () => { await sendPasswordResetEmail(auth, email.trim()); return "si la cuenta existe, te mandamos un correo para cambiar la contraseña."; })}>olvidé mi contraseña</button>
    {note && <p className={s.note} role="status">{note}</p>}
  </form>;
}
