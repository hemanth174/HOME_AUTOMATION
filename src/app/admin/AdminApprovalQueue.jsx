import { Ban, Check, CircleAlert } from 'lucide-react';

export default function AdminApprovalQueue({ approvals, visibleApprovals, approvalStats, approvalFilter, setApprovalFilter, approvalAction, reviewAccount, setDenyTarget, setDenyReason, approvalState }) {
  const filters = [['all', 'All', approvalStats.all], ['pending', 'Needs review', approvalStats.pending], ['awaiting_second', 'Second review', approvalStats.awaiting_second], ['approved', 'Approved', approvalStats.approved], ['denied', 'Denied', approvalStats.denied + approvalStats.revoked]];
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 className="text-base font-black">Account approval queue</h2>
        <p className="mt-1 text-[11px] leading-5 font-semibold text-text-muted">Both administrators must approve before dashboard access is unlocked.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {filters.map(([key, label, count]) => <button key={key} onClick={() => setApprovalFilter(key)} className={\`min-h-16 rounded-xl border px-3 py-2 text-left transition-colors \${approvalFilter === key ? 'border-accent bg-accent/10' : 'border-border bg-background hover:border-accent/50'}\`}><span className="block break-words text-[9px] font-black uppercase tracking-wide text-text-muted">{label}</span><span className="mt-1 block text-lg font-black text-text">{count}</span></button>)}
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-background text-[10px] font-black uppercase tracking-[.16em] text-text-muted"><tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Admin 1</th><th className="px-5 py-4">Admin 2</th><th className="px-5 py-4 text-right">Review</th></tr></thead>
          <tbody className="divide-y divide-border">{visibleApprovals.map((item) => {
            const state = approvalState(item);
            const actionBusy = approvalAction?.startsWith(\`\${item.user_id}:\`);
            return <tr key={item.user_id}>
              <td className="px-5 py-4"><p className="break-all text-sm font-black">{item.email}</p><p className="mt-1 text-[11px] text-text-muted">Requested {item.requested_at ? new Date(item.requested_at).toLocaleDateString('en-IN') : '—'}</p></td>
              <td className="px-5 py-4"><span className={\`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase \${state.tone}\`}>{state.label}</span>{item.rejection_reason && <p className="mt-2 max-w-[190px] break-words text-[10px] font-semibold text-red-500">{item.rejection_reason}</p>}</td>
              <td className="px-5 py-4 text-xs font-semibold">{item.admin_one_approved_at ? \`Approved by \${item.admin_one_email}\` : 'Waiting'}</td>
              <td className="px-5 py-4 text-xs font-semibold">{item.admin_two_approved_at ? \`Approved by \${item.admin_two_email}\` : 'Waiting'}</td>
              <td className="px-5 py-4 text-right">{(state.key === 'pending' || state.key === 'awaiting_second') && <div className="flex justify-end gap-2"><button disabled={actionBusy} onClick={() => reviewAccount(item.user_id, 'approve')} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-black text-[var(--btn-text)] disabled:opacity-50"><Check size={13} /> {actionBusy ? 'Saving…' : state.key === 'awaiting_second' ? 'Approve second' : 'Approve'}</button><button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: 'reject' }); setDenyReason(''); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-400/40 px-3 py-1.5 text-[11px] font-black text-red-500 hover:bg-red-400/10 disabled:opacity-50"><Ban size={13} /> Deny</button></div>}{state.key === 'approved' && <button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: 'revoke' }); setDenyReason(''); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-orange-400/40 px-3 py-1.5 text-[11px] font-black text-orange-500 hover:bg-orange-400/10 disabled:opacity-50"><CircleAlert size={13} /> Revoke</button>}{(state.key === 'denied' || state.key === 'revoked') && <span className="text-xs font-bold text-text-muted">Access blocked</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {visibleApprovals.map((item) => {
          const state = approvalState(item);
          const actionBusy = approvalAction?.startsWith(\`\${item.user_id}:\`);
          return <article key={item.user_id} className="min-w-0 rounded-xl border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="break-all text-sm font-black">{item.email}</h3><p className="mt-1 text-[10px] text-text-muted">Requested {item.requested_at ? new Date(item.requested_at).toLocaleDateString('en-IN') : '—'}</p></div>
              <span className={\`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase \${state.tone}\`}>{state.label}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-border p-3 text-[11px] sm:grid-cols-2">
              <div><p className="text-text-muted">Administrator 1</p><p className="mt-1 break-words font-bold">{item.admin_one_approved_at ? \`Approved by \${item.admin_one_email}\` : 'Waiting'}</p></div>
              <div><p className="text-text-muted">Administrator 2</p><p className="mt-1 break-words font-bold">{item.admin_two_approved_at ? \`Approved by \${item.admin_two_email}\` : 'Waiting'}</p></div>
            </div>
            {item.rejection_reason && <p className="mt-2 break-words text-[11px] text-red-500">{item.rejection_reason}</p>}
            {(state.key === 'pending' || state.key === 'awaiting_second') && <div className="mt-3 grid grid-cols-2 gap-2"><button disabled={actionBusy} onClick={() => reviewAccount(item.user_id, 'approve')} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-accent px-2 text-[11px] font-black text-[var(--btn-text)] disabled:opacity-50"><Check size={13} /> {actionBusy ? 'Saving…' : state.key === 'awaiting_second' ? 'Approve second' : 'Approve'}</button><button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: 'reject' }); setDenyReason(''); }} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-red-400/40 px-2 text-[11px] font-black text-red-500 disabled:opacity-50"><Ban size={13} /> Deny</button></div>}
            {state.key === 'approved' && <button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: 'revoke' }); setDenyReason(''); }} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-xl border border-orange-400/40 text-[11px] font-black text-orange-500 disabled:opacity-50"><CircleAlert size={13} /> Revoke access</button>}
          </article>;
        })}
      </div>
      {visibleApprovals.length === 0 && <div className="p-10 text-center text-sm font-semibold text-text-muted">{approvals.length === 0 ? 'No approval requests.' : 'No requests match this state.'}</div>}
    </section>
  );
}
