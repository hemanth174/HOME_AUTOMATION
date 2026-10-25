import { Ban, Check, CircleAlert } from 'lucide-react';

export default function AdminApprovalQueue({ approvals, visibleApprovals, approvalStats, approvalFilter, setApprovalFilter, approvalAction, reviewAccount, setDenyTarget, setDenyReason, approvalState }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-base font-black">Account approval queue</h2>
        <p className="mt-1 text-[11px] font-semibold text-text-muted">Both administrators must approve before dashboard access is unlocked.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[['all', 'All', approvalStats.all], ['pending', 'Needs review', approvalStats.pending], ['awaiting_second', 'Second review', approvalStats.awaiting_second], ['approved', 'Approved', approvalStats.approved], ['denied', 'Denied', approvalStats.denied + approvalStats.revoked]].map(([key, label, count]) => <button key={key} onClick={() => setApprovalFilter(key)} className={`rounded-xl border px-3 py-2 text-left transition-colors ${approvalFilter === key ? 'border-accent bg-accent/10' : 'border-border bg-background hover:border-accent/50'}`}><span className="block text-[9px] font-black uppercase tracking-wide text-text-muted">{label}</span><span className="mt-1 block text-lg font-black text-text">{count}</span></button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left"><thead className="bg-background text-[10px] font-black uppercase tracking-[.16em] text-text-muted"><tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Admin 1</th><th className="px-5 py-4">Admin 2</th><th className="px-5 py-4 text-right">Review</th></tr></thead>
          <tbody className="divide-y divide-border">{visibleApprovals.map((item) => { const state = approvalState(item); const actionBusy = approvalAction?.startsWith(`${item.user_id}:`); return <tr key={item.user_id}>
            <td className="px-5 py-4"><p className="text-sm font-black">{item.email}</p><p className="mt-1 text-[11px] text-text-muted">Requested {item.requested_at ? new Date(item.requested_at).toLocaleDateString('en-IN') : '—'}</p></td>
            <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${state.tone}`}>{state.label}</span>{item.rejection_reason && <p className="mt-2 max-w-[190px] text-[10px] font-semibold text-red-500">{item.rejection_reason}</p>}</td>
            <td className="px-5 py-4 text-xs font-semibold">{item.admin_one_approved_at ? `Approved by ${item.admin_one_email}` : 'Waiting'}</td>
            <td className="px-5 py-4 text-xs font-semibold">{item.admin_two_approved_at ? `Approved by ${item.admin_two_email}` : 'Waiting'}</td>
            <td className="px-5 py-4 text-right">
              {(state.key === 'pending' || state.key === 'awaiting_second') && <div className="flex justify-end gap-2"><button disabled={actionBusy} onClick={() => reviewAccount(item.user_id, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-black text-[var(--btn-text)] disabled:opacity-50"><Check size={13} /> {actionBusy ? 'Saving…' : state.key === 'awaiting_second' ? 'Approve second' : 'Approve'}</button><button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: 'reject' }); setDenyReason(''); }} className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-1.5 text-[11px] font-black text-red-500 hover:bg-red-400/10 disabled:opacity-50"><Ban size={13} /> Deny</button></div>}
              {state.key === 'approved' && <button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: 'revoke' }); setDenyReason(''); }} className="inline-flex items-center gap-1 rounded-lg border border-orange-400/40 px-3 py-1.5 text-[11px] font-black text-orange-500 hover:bg-orange-400/10 disabled:opacity-50"><CircleAlert size={13} /> Revoke</button>}
              {(state.key === 'denied' || state.key === 'revoked') && <span className="text-xs font-bold text-text-muted">Access blocked</span>}
            </td>
          </tr>; })}</tbody>
        </table>
        {visibleApprovals.length === 0 && <div className="p-12 text-center text-sm font-semibold text-text-muted">{approvals.length === 0 ? 'No approval requests.' : 'No requests match this state.'}</div>}
      </div>
    </section>
  );
}
