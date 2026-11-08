import React, { useCallback, useEffect, useState } from 'react';
import { Heart, Landmark, Link2Off, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { useAction, useConvex } from 'convex/react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { hcGranted, hcOpenSettings, hcRequest, hcStatus, lastSync, syncHealthConnect, type HcStatus } from '../../lib/healthConnect';
import { confirmDialog, noticeDialog } from '../Dialog';
import { Btn, Card, Field, fmtWhen, Input, List, Note, Pill, Row, Screen, Section, Select, Sheet, Toggle, attempt, useBusy } from './ui';

const REMINDERS = [
  ['doses', 'Doses', 'At dose time'],
  ['refills', 'Refills', 'When about a week is left'],
  ['appointments', 'Appointments', 'The evening before, 2 hours before, and fasting'],
  ['prevention', 'Vaccines and check-ups', 'When one is due'],
  ['renewals', 'Insurance renewal and expiring medicines', '30 days ahead'],
  ['hideDetails', 'Hide medicine names on the lock screen', 'Shows “Time for your 21:30 medicine”'],
] as const;

export const SettingsHealth: React.FC = () => {
  const people = useQuery(api.health.profile.people);
  const abdm = useQuery(api.health.abdm.status);
  const save = useMutation(api.health.profile.save);
  const me = people?.find((p) => p.isMe);
  const profile = me?.profile;
  const reminders = profile?.reminders ?? { doses: true, refills: true, appointments: true, prevention: true, renewals: true, hideDetails: true };
  const units = profile?.units ?? { glucose: 'mg/dL', cholesterol: 'mg/dL', weight: 'kg', temp: 'C' };
  const aiOn = profile?.aiReading !== false;
  const [abhaOpen, setAbhaOpen] = useState(false);
  const unlink = useMutation(api.health.profile.unlinkAbha);
  const deleteMine = useMutation(api.health.profile.deleteMine);

  return (
    <Screen title="Health settings" sub="Sync, reminders, privacy">
      <HealthConnectCard />

      <Section title="ABHA (Ayushman Bharat Health Account)">
        <List>
          {profile?.abhaNumber ? (
            <>
              <Row icon={<Landmark size={16} />} tone="coral" title={profile.abhaName ?? 'ABHA linked'} meta={`${profile.abhaNumber}${profile.abhaAddress ? ` · ${profile.abhaAddress}` : ''}`} end={profile.abhaVerifiedAt ? <Pill tone="sage">Verified</Pill> : <Pill tone="gold">Typed in</Pill>} />
              {me?.abhaCardUrl && <Row title="ABHA card" meta="Open the card image" onClick={() => window.open(me.abhaCardUrl!, '_blank')} />}
              <Row icon={<Link2Off size={16} />} title="Unlink ABHA" onClick={async () => { if (await confirmDialog({ title: 'Unlink ABHA?', body: 'The number and card are removed from Mobu. Your ABHA account itself is unaffected.', confirmLabel: 'Unlink', danger: true })) await attempt(() => unlink({})); }} />
            </>
          ) : (
            <Row icon={<Landmark size={16} />} tone="coral" title="Link your ABHA" meta={abdm?.configured ? 'Verify with an OTP sent to your ABHA mobile' : 'Type your number and upload the card'} onClick={() => setAbhaOpen(true)} />
          )}
        </List>
        <Note>Your ABHA number goes on your Medical ID. To bring in hospital records, open the ABHA app, download them as a FHIR file, and share it to Mobu (Records → Import a FHIR file).</Note>
      </Section>

      <Section title="Reminders">
        <List>
          {REMINDERS.map(([k, title, meta]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex flex-col"><span className="text-[15px]">{title}</span><span className="text-xs text-white/45">{meta}</span></span>
              <Toggle on={reminders[k]} label={title} onChange={(v) => attempt(() => save({ reminders: { ...reminders, [k]: v } }))} />
            </div>
          ))}
        </List>
        <Note>Reminders arrive as notifications, so allow notifications for Mobu in your phone's settings.</Note>
      </Section>

      <Section title="Units">
        <List>
          <UnitRow label="Blood sugar" value={units.glucose} options={['mg/dL', 'mmol/L']} onChange={(v) => attempt(() => save({ units: { ...units, glucose: v as never } }))} />
          <UnitRow label="Cholesterol" value={units.cholesterol} options={['mg/dL', 'mmol/L']} onChange={(v) => attempt(() => save({ units: { ...units, cholesterol: v as never } }))} />
          <UnitRow label="Weight" value={units.weight} options={['kg', 'lb']} onChange={(v) => attempt(() => save({ units: { ...units, weight: v as never } }))} />
          <UnitRow label="Temperature" value={units.temp} options={['C', 'F']} onChange={(v) => attempt(() => save({ units: { ...units, temp: v as never } }))} />
        </List>
        <Note>Values are stored in one unit so charts line up across labs; you can flip a lab chart between units on its page.</Note>
      </Section>

      <Section title="Privacy">
        <List>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex flex-col"><span className="text-[15px]">Read reports with AI</span><span className="text-xs text-white/45">Sends the report to Google Gemini to pull out the values. Off: you type values in.</span></span>
            <Toggle on={aiOn} label="Read reports with AI" onChange={(v) => attempt(() => save({ aiReading: v }))} />
          </div>
          <Row title="Delete my health data" meta="Removes yours only, not your partner's" onClick={async () => {
            if (!(await confirmDialog({ title: 'Delete all your health data?', body: 'Records, files, labs, readings, medicines, history and sharing links are removed for good. Your partner keeps theirs. Download a copy first from Share.', confirmLabel: 'Delete everything', danger: true }))) return;
            await attempt(() => deleteMine({ confirm: 'DELETE' }));
            await noticeDialog('Deleted', 'Your health data has been removed.');
          }} end={<Trash2 size={16} className="text-coral" />} />
        </List>
      </Section>
      <AbhaSheet open={abhaOpen} onClose={() => setAbhaOpen(false)} configured={!!abdm?.configured} env={abdm?.environment} />
    </Screen>
  );
};

const UnitRow = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
    <span className="text-sm">{label}</span>
    <div className="w-32"><Select value={value} onChange={onChange} options={options.map((o) => ({ value: o, label: o }))} aria-label={label} /></div>
  </div>
);

/* ---------------- Health Connect ---------------- */

function HealthConnectCard() {
  const people = useQuery(api.health.profile.people);
  const profile = people?.find((p) => p.isMe)?.profile;
  const convex = useConvex();
  const importBatch = useMutation(api.health.vitals.importHealthConnect);
  const [status, setStatus] = useState<HcStatus | null>(null);
  const [perm, setPerm] = useState<{ read: number; total: number; write: number; history: boolean } | null>(null);
  const [cycle, setCycle] = useState(!!profile?.cycleEnabled);
  const [write, setWrite] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, run] = useBusy();

  useEffect(() => setCycle(!!profile?.cycleEnabled), [profile?.cycleEnabled]);
  const refresh = useCallback(async () => {
    const s = await hcStatus();
    setStatus(s);
    if (s === 'available') setPerm(await hcGranted(cycle, write).catch(() => null));
  }, [cycle, write]);
  useEffect(() => void refresh(), [refresh]);

  const sync = () =>
    run(async () => {
      const res = await syncHealthConnect(
        {
          importBatch: (a) => importBatch(a as never),
          manualSince: async (since) => (await convex.query(api.health.vitals.manualSince, { since })).filter((v) => ['bp', 'glucose', 'weight', 'temp', 'spo2', 'height', 'bodyFat'].includes(v.type)).map((v) => ({ type: v.type as never, time: v.time, value: v.value, value2: v.value2 })),
          cycle,
          write,
        },
        setMsg,
      );
      setMsg(`Synced: ${res.added} new, ${res.updated} updated${res.written ? `, ${res.written} written back` : ''}`);
    }, "Couldn't sync");

  const connect = () =>
    run(async () => {
      const r = await hcRequest(cycle, write);
      setPerm(r);
      if (r.read === 0) {
        await noticeDialog('Nothing was allowed', 'Health Connect needs your OK before Mobu can read anything. Tap Connect again and allow the data you want to share.');
        return;
      }
      await sync();
    }, "Couldn't connect");

  const connected = !!perm && perm.read > 0;
  const native = Capacitor.isNativePlatform();

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-base"><Heart size={17} className="text-coral" />Health Connect</span>
        {status === 'available' ? (connected ? <Pill tone="sage">Connected</Pill> : <Pill>Not connected</Pill>) : <Pill tone="muted">{status === 'update' ? 'Update needed' : 'Android app only'}</Pill>}
      </div>
      {!native || status === 'no-plugin' || status === 'unavailable' ? (
        <p className="text-sm text-white/55">{!native ? 'Health Connect works in the Android app. Open Mobu on your phone to bring in steps, sleep, heart rate, blood pressure, blood sugar and weight from your watch and devices.' : status === 'no-plugin' ? 'This version of the app was built before Health Connect was added. Install the latest Mobu APK.' : 'Health Connect isn\'t on this phone. On Android 13 or older, install it from the Play Store; on Android 14+ it is built in.'}</p>
      ) : status === 'update' ? (
        <Btn onClick={() => hcOpenSettings().catch(() => {})}>Update Health Connect</Btn>
      ) : (
        <>
          <p className="text-sm text-white/55">Pulls in what your watch, BP monitor, glucometer and phone record: steps, distance, sleep with stages, heart rate, resting HR, HRV, SpO₂, breathing rate, temperature, blood pressure, blood sugar, weight, height, body fat, VO₂ max, workouts and water.</p>
          <div className="flex items-center justify-between gap-3"><span className="text-sm">Include cycle data</span><Toggle on={cycle} label="Include cycle data" onChange={setCycle} /></div>
          <div className="flex items-center justify-between gap-3"><span className="text-sm">Write readings I type here back to Health Connect</span><Toggle on={write} label="Write back" onChange={setWrite} /></div>
          {connected && <p className="text-xs text-white/45">{perm!.read} of {perm!.total} data types allowed{perm!.history ? ', with history' : ', last 30 days only'}. {lastSync() ? `Last sync ${fmtWhen(lastSync())}.` : ''}</p>}
          <div className="flex gap-2">
            <Btn busy={busy} onClick={connect}>{connected ? 'Change what is shared' : 'Connect'}</Btn>
            {connected && <Btn kind="secondary" busy={busy} onClick={sync}><RefreshCw size={16} />Sync now</Btn>}
          </div>
          {msg && <p className="text-xs text-white/55">{msg}</p>}
          <button type="button" className="self-start text-xs text-nothing-purple" onClick={() => hcOpenSettings().catch(() => {})}>Open Health Connect settings</button>
        </>
      )}
      <p className="flex gap-1.5 text-xs text-white/40"><Smartphone size={13} className="mt-0.5 shrink-0" />Mobu syncs when you open Health and once a day while the app is in use. Everything you allow can be turned off in Health Connect at any time.</p>
    </Card>
  );
}

/* ---------------- ABHA linking ---------------- */

function AbhaSheet({ open, onClose, configured, env }: { open: boolean; onClose: () => void; configured: boolean; env?: string }) {
  const save = useMutation(api.health.profile.save);
  const requestOtp = useAction(api.health.abdm.requestOtp);
  const verifyOtp = useAction(api.health.abdm.verifyOtp);
  const [step, setStep] = useState<'number' | 'otp'>('number');
  const [number, setNumber] = useState('');
  const [address, setAddress] = useState('');
  const [via, setVia] = useState<'abdm' | 'aadhaar'>('abdm');
  const [otp, setOtp] = useState('');
  const [busy, run] = useBusy();
  const digits = number.replace(/\D/g, '');
  const fmt = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 14); return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10)].filter(Boolean).join('-'); };

  return (
    <Sheet open={open} onClose={() => { setStep('number'); setOtp(''); onClose(); }} title="Link your ABHA">
      {step === 'number' ? (
        <>
          <Field label="ABHA number"><Input inputMode="numeric" value={number} onChange={(e) => setNumber(fmt(e.target.value))} placeholder="91-1234-5678-9012" /></Field>
          {configured ? (
            <>
              <Field label="Send the OTP to"><Select value={via} onChange={setVia} options={[{ value: 'abdm', label: 'Mobile linked to ABHA' }, { value: 'aadhaar', label: 'Mobile linked to Aadhaar' }]} /></Field>
              <Btn busy={busy} disabled={digits.length !== 14} onClick={async () => { const r = await run(() => requestOtp({ abhaNumber: digits, via }), "Couldn't send the OTP"); if (r) setStep('otp'); }}>Send OTP</Btn>
              <Note>Verified with ABDM{env === 'sandbox' ? ' (test environment)' : ''}. Mobu never stores your Aadhaar number or the OTP.</Note>
            </>
          ) : (
            <>
              <Field label="ABHA address (optional)"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="name@abdm" /></Field>
              <Btn disabled={digits.length !== 14} onClick={async () => { const ok = await attempt(() => save({ abhaNumber: digits, abhaAddress: address || undefined })); if (ok !== undefined) onClose(); }}>Save</Btn>
              <Note>Live OTP verification needs Mobu to be registered with ABDM. Until then your number is saved as typed and shows “Typed in”. It still appears on your Medical ID.</Note>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-white/60">Enter the 6-digit code sent to your phone.</p>
          <Field label="OTP"><Input inputMode="numeric" autoFocus maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} /></Field>
          <Btn busy={busy} disabled={otp.length !== 6} onClick={async () => { const r = await run(() => verifyOtp({ otp }), "Couldn't verify"); if (r) { setStep('number'); setOtp(''); onClose(); await noticeDialog('ABHA linked', 'Your ABHA number and name are on your Medical ID now.'); } }}>Verify</Btn>
          <button type="button" className="text-sm text-white/50" onClick={() => setStep('number')}>Use a different number</button>
        </>
      )}
    </Sheet>
  );
}
