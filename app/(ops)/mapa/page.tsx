"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import { TIER_LABEL, ZONE_COLOR, donorPins, missionPins, pinsCenter, type MapPin, type ZoneBadge } from "@/lib/map/points";
import type { MissionItem } from "@/lib/offers/missions";
import type { Offer } from "@/lib/offers/types";
import type { Point } from "@/lib/network/types";
import type { PublicRegistration } from "@/lib/registry/display";
import { TeamSignIn } from "../team/sign-in";

const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), { ssr: false });

// Map (E6): the organization's own points plus, per offer, eligible destinations by zone.
// Exact pins only where entitled: own lots and committed pickups. Zone lists carry no coordinates.

export default function MapaPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [reg, setReg] = useState<PublicRegistration | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [missions, setMissions] = useState<MissionItem[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setReg(null); setOffers(null); setMissions(null); return; }
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/org/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404 || d?.error === "no-registration") { setReg(null); return; }
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu organización.");
      const me = d.registration as PublicRegistration;
      setReg(me);
      if (me.roles.includes("donor")) {
        const ro = await fetch("/api/offers", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const od = await ro.json().catch(() => null);
        const list = ro.ok && od?.ok ? od.offers as Offer[] : [];
        setOffers(list);
        if (list.length > 0) setSelected((s) => s || list[0].id);
      }
      if (!me.roles.every((x) => x === "donor")) {
        const rm = await fetch("/api/missions", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const dm = await rm.json().catch(() => null);
        setMissions(rm.ok && dm?.ok ? dm.missions as MissionItem[] : []);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  const donor = useMemo(() => donorPins(offers ?? []), [offers]);
  const mpins = useMemo(() => missionPins(missions ?? []), [missions]);
  const ownPin: MapPin | null = reg?.location ? { id: "mine", point: reg.location as Point, title: reg.name, detail: "tu organización", kind: "mine" } : null;
  const pins = useMemo(() => [...(ownPin ? [ownPin] : []), ...donor.pins, ...mpins], [reg, donor, mpins]); // eslint-disable-line react-hooks/exhaustive-deps
  const center = useMemo(() => pinsCenter(pins), [pins]);
  const zones: ZoneBadge[] = selected ? donor.zones[selected] ?? [] : [];

  const isDonor = !!reg?.roles.includes("donor");
  const isReceiver = !!reg && !reg.roles.every((x) => x === "donor");

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">el mapa necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para ver tu mapa</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {error && <div className="section-block"><p className="error" role="alert">{error}</p></div>}
    {authReady && user && !reg && <div className="section-block">
      <p className="empty">aún no registras tu organización. <a href="/cuenta">regístrala en /cuenta</a> y vuelve aquí.</p>
    </div>}
    {authReady && user && reg && <>
      <div className="hero">
        <p className="eyebrow">mapa</p>
        <h1>dónde está <em>lo tuyo</em></h1>
        <p className="lede">tus puntos y tus recolecciones comprometidas. los destinos elegibles se listan por zona, sin direcciones exactas ajenas.</p>
      </div>
      <div className="section-block">
        <MapView pins={pins} center={center} />
        {pins.length === 0 && <p className="empty">sin puntos todavía: publica una oferta o programa una recolección y aparecerá aquí.</p>}
        {!reg.location && <p className="empty">tu organización aún no tiene punto ubicado (lo coloca el equipo al verificarte).</p>}
      </div>
      {isDonor && <div className="section-block">
        <div className="section-head"><h2>destinos elegibles por zona</h2></div>
        {offers === null && <p className="empty">cargando tus ofertas…</p>}
        {offers !== null && offers.length === 0 && <p className="empty">aún no publicas ofertas. <a href="/publicar">publica la primera ↗</a></p>}
        {(offers ?? []).length > 0 && <>
          <label htmlFor="offer">oferta</label>
          <select id="offer" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {(offers ?? []).map((o) => <option key={o.id} value={o.id}>{o.item || o.category || "lote"}</option>)}
          </select>
          {zones.length === 0 && <p className="empty">sin destinos elegibles por ahora.</p>}
          {zones.map((z) => <p key={z.participantId}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: ZONE_COLOR[z.zone], marginRight: 8 }} />
            <span className="keep-case">{z.name}</span> · zona {z.zone} · {TIER_LABEL[z.tier]} · hasta {z.maxKg} kg.
          </p>)}
        </>}
      </div>}
      {isReceiver && <div className="section-block">
        <div className="section-head"><h2>tus recolecciones</h2><a className="step" href="/recibir">abrir /recibir ↗</a></div>
        {missions === null && <p className="empty">cargando tus misiones…</p>}
        {missions !== null && mpins.length === 0 && <p className="empty">sin recolecciones comprometidas todavía.</p>}
        {mpins.map((p) => <p key={p.id}><span className="keep-case">{p.title}</span> · <span className="keep-case">{p.detail}</span></p>)}
      </div>}
    </>}
  </div>;
}
