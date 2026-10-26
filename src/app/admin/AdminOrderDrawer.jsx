import { Check, X } from 'lucide-react';

export default function AdminOrderDrawer({ order, stages, categoryLabels, stageColors, onClose, onStage }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end overflow-hidden bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-4 shadow-2xl sm:p-6 lg:p-8">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-all font-mono text-xs font-black text-cyan-300">{order.order_id}</p><h2 className="mt-2 break-words text-xl font-black sm:text-2xl">{order.full_name || 'Customer'}</h2><p className="mt-1 break-all text-xs font-semibold text-text-muted">{order.email}</p></div>
          <button onClick={onClose} aria-label="Close order details" className="shrink-0 rounded-lg border border-border p-2 text-text-muted hover:text-text"><X size={16} /></button>
        </div>
        <div className="mt-6 sm:mt-8"><p className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-text-muted">Move project to stage</p><div className="grid grid-cols-2 gap-2">{stages.map((stage) => <button key={stage} disabled={order.status === stage} onClick={() => onStage(order.order_id, stage)} className={`min-w-0 rounded-xl border px-3 py-3 text-left text-[11px] font-black transition-colors sm:text-xs ${order.status === stage ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/60'}`}>{stage}{order.status === stage && <Check size={14} className="float-right" />}</button>)}</div></div>
        <div className="mt-6 rounded-xl border border-border bg-background p-3 sm:mt-8 sm:p-4"><h3 className="text-[10px] font-black uppercase tracking-[.18em] text-text-muted">Project details</h3><div className="mt-4 space-y-3 text-xs"><p><span className="text-text-muted">Phone</span><br /><b className="break-words">{order.phone || '—'}</b></p><p><span className="text-text-muted">Category</span><br /><b className="break-words">{categoryLabels[order.category] || order.category || '—'}</b></p><p><span className="text-text-muted">Address</span><br /><b className="break-words">{order.address || '—'}</b></p>{Object.entries(order.details || {}).map(([key, value]) => <p key={key}><span className="capitalize text-text-muted">{key.replace(/[A-Z]/g, (match) => ` ${match}`)}</span><br /><b className="break-words">{String(value)}</b></p>)}</div></div>
        <div className="mt-6 sm:mt-8"><h3 className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-text-muted">Update history</h3><div className="space-y-3">{(order.status_history || []).map((entry, index) => <div key={`${entry.at}-${index}`} className="flex gap-3 text-xs"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /><div className="min-w-0"><b className="break-words">{entry.status}</b><p className="break-words text-text-muted">{entry.at ? new Date(entry.at).toLocaleString('en-IN') : ''}</p></div></div>)}</div></div>
      </aside>
    </div>
  );
}
