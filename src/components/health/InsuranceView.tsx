import React, { useRef, useState } from 'react';
import { Building, Download, ShieldCheck, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { saveTextFile } from '../../lib/saveFile';
import { Av, Btn, Card, cx, Field, fmtDate, IconBtn, Input, List, Note, Pill, Row, Screen, Section, Select, Sheet, TextArea, attempt, money, num, usePeople, useUpload } from './ui';
import { Plus } from 'lucide-react';

type Overview = NonNullable<ReturnType<typeof useQuery<typeof api.health.insurance.overview>>>;
type Policy = Overview['policies'][number];
const STAGES = ['filed', 'documents', 'review', 'approved', 'paid'] as const;
const STAGE_LABEL: Record<string, string> = { filed: 'Filed', documents: 'Papers sent', review: 'In review', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' };

export const InsuranceView: React.FC = () => {
  const data = useQuery(api.health.insurance.overview);
  const { meId, partnerId, meName, partnerName } = usePeople();
  const [policy, setPolicy] = useState<Policy | 'new' | null>(null);
  const [claim, setClaim] = useState<{ policyId: Id<'insurancePolicies'>; claim?: Policy['claims'][number] } | null>(null);

  const exportTax = async () => {
    if (!data) return;
    const t = data.tax;
    const rows = [['Item', 'Amount (INR)'], ['Health insurance premiums', t.premiums], ['Preventive check-ups (limit 5000)', t.preventive], ['Section 80D deduction (limit 25000)', t.deductible], [], ['Policy', 'Insurer', 'Premium', 'Policy no.'], ...data.policies.filter((p) => p.premium).map((p) => [p.plan ?? p.kind, p.insurer, p.premium, p.policyNumber ?? ''])];
    await saveTextFile(`80D-${t.fyStart.slice(0, 4)}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv');
  };

  return (
    <Screen title="Insurance" sub="Policies, claims and what it all cost" actions={<IconBtn icon={Plus} label="Add a policy" primary onClick={() => setPolicy('new')} />}>
      {data && data.policies.length === 0 && <Card onClick={() => setPolicy('new')}><ShieldCheck size={22} className="text-azure" /><span className="text-[15px]">Add your health insurance</span><span className="text-sm text-white/55">Sum insured, renewal date, TPA helpline and the e-card, so it's there at a hospital desk. Renewal reminders come 30 days ahead.</span></Card>}
      {data?.policies.map((p) => (
        <div key={p._id} className="space-y-3">
          <Card className="bg-gradient-to-br from-azure/15 to-transparent">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/50">{p.insurer} · {p.kind === 'floater' ? 'Family floater' : p.kind === 'group' ? 'Employer cover' : p.kind === 'topup' ? 'Top-up' : 'Individual'}</span>
              <span className="flex">{p.members.map((m, i) => <span key={m} className={i ? '-ml-1.5' : ''}><Av isMe={m === meId} name={m === meId ? meName : partnerName} /></span>)}</span>
            </div>
            {p.sumInsured != null && <div className="font-mono text-3xl leading-tight">{money(p.sumInsured)} <small className="font-sans text-xs text-white/45">sum insured</small></div>}
            {p.sumInsured ? <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full bg-azure" style={{ width: `${Math.min(100, (p.used / p.sumInsured) * 100)}%` }} /></div> : null}
            <span className="text-xs text-white/50">{money(p.used)} claimed this policy year</span>
            <div className="glass divide-y divide-white/[0.07] !shadow-none">
              {p.renewal && <Line k="Renews" v={`${fmtDate(p.renewal)}${p.daysToRenewal != null && p.daysToRenewal >= 0 ? ` · in ${p.daysToRenewal} days` : ''}`} warn={p.daysToRenewal != null && p.daysToRenewal <= 30} />}
              {p.premium != null && <Line k="Premium" v={`${money(p.premium)} / yr`} />}
              {p.policyNumber && <Line k="Policy no." v={p.policyNumber} mono />}
              {p.tpa && <Line k="TPA" v={p.tpa} />}
              {p.tpaPhone && <Line k="Helpline" v={p.tpaPhone} mono link={`tel:${p.tpaPhone}`} />}
              {p.waitingNotes && <Line k="Waiting periods" v={p.waitingNotes} />}
            </div>
            <div className="flex flex-wrap gap-2">
              {p.files.map((f) => <a key={f.storageId} href={f.url ?? '#'} target="_blank" rel="noreferrer" className="glass rounded-full px-3.5 py-2 text-xs">{f.name}</a>)}
              <button type="button" onClick={() => setPolicy(p)} className="glass rounded-full px-3.5 py-2 text-xs">Edit</button>
            </div>
          </Card>
          <Section title="Claims" action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setClaim({ policyId: p._id })}>File one</button>}>
            {p.claims.map((c) => {
              const idx = STAGES.indexOf(c.stage as never);
              return (
                <Card key={c._id} onClick={() => setClaim({ policyId: p._id, claim: c })}>
                  <div className="flex justify-between"><div><div className="text-[15px]">{c.title}</div><div className="text-xs text-white/45">{c.kind === 'cashless' ? 'Cashless' : 'Reimbursement'} · {c.patientName} · {money(c.claimed)}{c.paid ? ` · paid ${money(c.paid)}` : ''}</div></div><Pill tone={c.stage === 'paid' ? 'sage' : c.stage === 'rejected' ? 'coral' : 'gold'}>{STAGE_LABEL[c.stage]}</Pill></div>
                  {c.stage !== 'rejected' && (
                    <>
                      <div className="flex gap-1">{STAGES.map((s, i) => <i key={s} className={cx('h-1 flex-1 rounded-full', i < idx ? 'bg-sage' : i === idx ? 'bg-gold' : 'bg-white/10')} />)}</div>
                      <div className="flex justify-between text-[10px] text-white/40">{STAGES.map((s) => <span key={s}>{STAGE_LABEL[s]}</span>)}</div>
                    </>
                  )}
                </Card>
              );
            })}
            {p.claims.length === 0 && <Note>No claims yet.</Note>}
          </Section>
        </div>
      ))}

      {data && data.spend.total > 0 && (
        <Section title={`Spent on health, ${data.spend.year}`}>
          <Card>
            <div className="font-mono text-[28px]">{money(data.spend.total)} <small className="font-sans text-xs text-white/45">from Split, Medical</small></div>
            <List className="!bg-transparent !shadow-none">{data.spend.byCategory.map((c) => <Row key={c.category} title={c.category} end={<span className="font-mono">{money(c.amount)}</span>} />)}</List>
          </Card>
        </Section>
      )}
      <Card>
        <div className="flex justify-between"><span className="text-[15px]">Tax: Section 80D</span><Pill>Old regime</Pill></div>
        <p className="text-sm text-white/60">Premiums <span className="font-mono">{money(data?.tax.premiums)}</span> + preventive check-ups <span className="font-mono">{money(data?.tax.preventive)}</span> (up to ₹5,000) = <b className="font-mono">{money(data?.tax.deductible)}</b> of the ₹25,000 limit for self and spouse.</p>
        <Btn kind="secondary" onClick={exportTax}><Download size={16} />Summary for your CA</Btn>
        <span className="text-xs text-white/40">A guide, not tax advice. Mark a record "Preventive check-up" to count it. Group (employer) premiums are excluded.</span>
      </Card>
      <Note>Bills added to Split under Medical count towards the spend above. <Building size={11} className="inline" /> cashless hospitals are marked in Visits → Care team.</Note>

      {policy && partnerId !== undefined && <PolicyForm policy={policy === 'new' ? null : policy} meId={meId!} partnerId={partnerId} meName={meName} partnerName={partnerName} onClose={() => setPolicy(null)} />}
      {claim && <ClaimForm policyId={claim.policyId} claim={claim.claim} patients={[{ id: meId!, name: meName }, ...(partnerId ? [{ id: partnerId, name: partnerName }] : [])]} onClose={() => setClaim(null)} />}
    </Screen>
  );
};

const Line = ({ k, v, mono, warn, link }: { k: string; v: string; mono?: boolean; warn?: boolean; link?: string }) => (
  <div className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span className="text-white/45">{k}</span>{link ? <a href={link} className={cx('text-right', mono && 'font-mono')}>{v}</a> : <span className={cx('text-right', mono && 'font-mono', warn && 'text-gold')}>{v}</span>}</div>
);

function PolicyForm({ policy, meId, partnerId, meName, partnerName, onClose }: { policy: Policy | null; meId: Id<'users'>; partnerId?: Id<'users'>; meName: string; partnerName: string; onClose: () => void }) {
  const add = useMutation(api.health.insurance.addPolicy);
  const update = useMutation(api.health.insurance.updatePolicy);
  const remove = useMutation(api.health.insurance.removePolicy);
  const upload = useUpload();
  const pick = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ insurer: policy?.insurer ?? '', plan: policy?.plan ?? '', kind: policy?.kind ?? ('floater' as Policy['kind']), sum: policy?.sumInsured != null ? String(policy.sumInsured) : '', premium: policy?.premium != null ? String(policy.premium) : '', number: policy?.policyNumber ?? '', tpa: policy?.tpa ?? '', tpaPhone: policy?.tpaPhone ?? '', start: policy?.start ?? '', renewal: policy?.renewal ?? '', waiting: policy?.waitingNotes ?? '', notes: policy?.notes ?? '', me: policy ? policy.members.includes(meId) : true, partner: policy ? !!partnerId && policy.members.includes(partnerId) : !!partnerId });
  const [files, setFiles] = useState(policy?.files.map(({ storageId, name, mime, size }) => ({ storageId, name, mime, size })) ?? []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const save = async () => {
    const payload = { insurer: f.insurer, plan: f.plan, kind: f.kind, members: [f.me && meId, f.partner && partnerId].filter(Boolean) as Id<'users'>[], sumInsured: num(f.sum), premium: num(f.premium), policyNumber: f.number, tpa: f.tpa, tpaPhone: f.tpaPhone, start: f.start || undefined, renewal: f.renewal || undefined, waitingNotes: f.waiting, notes: f.notes, files };
    const ok = await attempt(() => (policy ? update({ id: policy._id, ...payload }) : add(payload)));
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={policy ? 'Edit policy' : 'Add a policy'}>
      <Field label="Insurer"><Input value={f.insurer} onChange={(e) => set('insurer', e.target.value)} placeholder="Star Health" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Plan"><Input value={f.plan} onChange={(e) => set('plan', e.target.value)} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'floater', label: 'Family floater' }, { value: 'individual', label: 'Individual' }, { value: 'group', label: 'Employer cover' }, { value: 'topup', label: 'Top-up' }]} /></Field>
        <Field label="Sum insured ₹"><Input inputMode="numeric" value={f.sum} onChange={(e) => set('sum', e.target.value)} /></Field>
        <Field label="Premium ₹/year"><Input inputMode="numeric" value={f.premium} onChange={(e) => set('premium', e.target.value)} /></Field>
        <Field label="Starts"><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
        <Field label="Renews"><Input type="date" value={f.renewal} onChange={(e) => set('renewal', e.target.value)} /></Field>
        <Field label="Policy number"><Input value={f.number} onChange={(e) => set('number', e.target.value)} /></Field>
        <Field label="TPA / insurer"><Input value={f.tpa} onChange={(e) => set('tpa', e.target.value)} /></Field>
      </div>
      <Field label="Helpline"><Input inputMode="tel" value={f.tpaPhone} onChange={(e) => set('tpaPhone', e.target.value)} /></Field>
      <Field label="Waiting periods and exclusions"><TextArea value={f.waiting} onChange={(e) => set('waiting', e.target.value)} placeholder="Thyroid covered from Mar 2027" /></Field>
      <div className="flex gap-2">
        <button type="button" onClick={() => set('me', !f.me)} className={cx('flex-1 rounded-full py-2 text-sm', f.me ? 'bg-white text-black' : 'glass')}>{meName}</button>
        {partnerId && <button type="button" onClick={() => set('partner', !f.partner)} className={cx('flex-1 rounded-full py-2 text-sm', f.partner ? 'bg-white text-black' : 'glass')}>{partnerName}</button>}
      </div>
      <input ref={pick} type="file" accept="image/*,application/pdf" multiple hidden onChange={async (e) => { const picked = [...(e.target.files ?? [])]; await attempt(async () => { const up = []; for (const p of picked) up.push(await upload(p)); setFiles([...files, ...up]); }); }} />
      <Btn kind="secondary" onClick={() => pick.current?.click()}>{files.length ? `${files.length} files · add more` : 'Attach e-card or policy PDF'}</Btn>
      <Btn onClick={save}>Save</Btn>
      {policy && <Btn kind="danger" onClick={async () => { await attempt(() => remove({ id: policy._id })); onClose(); }}><Trash2 size={16} />Delete</Btn>}
    </Sheet>
  );
}

function ClaimForm({ policyId, claim, patients, onClose }: { policyId: Id<'insurancePolicies'>; claim?: Policy['claims'][number]; patients: { id: Id<'users'>; name: string }[]; onClose: () => void }) {
  const save = useMutation(api.health.insurance.saveClaim);
  const remove = useMutation(api.health.insurance.removeClaim);
  const [f, setF] = useState({ title: claim?.title ?? '', patient: claim?.patientId ?? patients[0].id, kind: claim?.kind ?? ('reimbursement' as 'cashless' | 'reimbursement'), claimed: claim?.claimed != null ? String(claim.claimed) : '', approved: claim?.approved != null ? String(claim.approved) : '', paid: claim?.paid != null ? String(claim.paid) : '', stage: claim?.stage ?? 'filed', filedOn: claim?.filedOn ?? new Date().toISOString().slice(0, 10), number: claim?.claimNumber ?? '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  return (
    <Sheet open onClose={onClose} title={claim ? 'Claim' : 'File a claim'}>
      <Field label="For"><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="MRI, right knee" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Patient"><Select value={f.patient} onChange={(v) => set('patient', v as Id<'users'>)} options={patients.map((p) => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'reimbursement', label: 'Reimbursement' }, { value: 'cashless', label: 'Cashless' }]} /></Field>
        <Field label="Claimed ₹"><Input inputMode="numeric" value={f.claimed} onChange={(e) => set('claimed', e.target.value)} /></Field>
        <Field label="Approved ₹"><Input inputMode="numeric" value={f.approved} onChange={(e) => set('approved', e.target.value)} /></Field>
        <Field label="Paid ₹"><Input inputMode="numeric" value={f.paid} onChange={(e) => set('paid', e.target.value)} /></Field>
        <Field label="Filed on"><Input type="date" value={f.filedOn} onChange={(e) => set('filedOn', e.target.value)} /></Field>
      </div>
      <Field label="Stage"><Select value={f.stage} onChange={(v) => set('stage', v)} options={[...STAGES, 'rejected' as const].map((s) => ({ value: s, label: STAGE_LABEL[s] }))} /></Field>
      <Field label="Claim number"><Input value={f.number} onChange={(e) => set('number', e.target.value)} /></Field>
      <Btn onClick={async () => { const ok = await attempt(() => save({ id: claim?._id, policyId, patientId: f.patient as Id<'users'>, title: f.title, kind: f.kind, claimed: num(f.claimed), approved: num(f.approved), paid: num(f.paid), stage: f.stage as never, filedOn: f.filedOn, claimNumber: f.number })); if (ok !== undefined) onClose(); }}>Save</Btn>
      {claim && <Btn kind="danger" onClick={async () => { await attempt(() => remove({ id: claim._id })); onClose(); }}>Delete</Btn>}
    </Sheet>
  );
}
