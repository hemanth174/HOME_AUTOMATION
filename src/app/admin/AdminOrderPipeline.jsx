import { ChevronDown, Search } from 'lucide-react';

function StatusPill({ status, stageColors }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${stageColors[status] || stageColors.Received}`}>{status}</span>;
}

export default function AdminOrderPipeline({ filtered, orders, query, setQuery, filter, setFilter, setSelected, stages, categoryLabels, stageColors }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
      <div><h2 className="text-base font-black">Order pipeline</h2><p className="mt-1 text-[11px] font-semibold text-text-muted">{filtered.length} visible of {orders.length} orders</p></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] md:flex">
        <div className="relative min-w-0"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, customer, email" className="min-h-11 w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-accent sm:w-64" /></div>
        <div className="relative min-w-0"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="min-h-11 w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-3 pr-9 text-xs font-black outline-none focus:border-accent sm:w-44"><option>All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" /></div>
      </div>
    </div>

    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-background text-[10px] font-black uppercase tracking-[.16em] text-text-muted"><tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Stage</th><th className="px-5 py-4">Created</th><th className="px-5 py-4 text-right">Manage</th></tr></thead>
        <tbody className="divide-y divide-border">
          {filtered.map((order) => <tr key={order.id || order.order_id} className="transition-colors hover:bg-accent-bg/20">
            <td className="px-5 py-4"><button onClick={() => setSelected(order)} className="font-mono text-xs font-black text-cyan-300 hover:underline">{order.order_id}</button></td>
            <td className="px-5 py-4"><p className="text-sm font-black">{order.full_name || 'Unknown customer'}</p><p className="mt-1 text-[11px] font-semibold text-text-muted">{order.email || 'No email'}</p></td>
            <td className="px-5 py-4 text-xs font-bold text-text-muted">{categoryLabels[order.category] || order.category || '—'}</td>
            <td className="px-5 py-4"><StatusPill status={order.status} stageColors={stageColors} /></td>
            <td className="px-5 py-4 text-xs font-semibold text-text-muted">{order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—'}</td>
            <td className="px-5 py-4 text-right"><button onClick={() => setSelected(order)} className="min-h-9 rounded-lg border border-border px-3 py-1.5 text-[11px] font-black hover:border-accent hover:text-accent">Open</button></td>
          </tr>)}
        </tbody>
      </table>
      {filtered.length === 0 && <div className="p-12 text-center text-sm font-semibold text-text-muted">No orders match this view.</div>}
    </div>

    <div className="space-y-3 p-3 md:hidden">
      {filtered.map((order) => <article key={order.id || order.order_id} className="min-w-0 rounded-xl border border-border bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-all font-mono text-[11px] font-black text-cyan-300">{order.order_id}</p><h3 className="mt-1 break-words text-sm font-black">{order.full_name || 'Unknown customer'}</h3><p className="mt-1 break-all text-[11px] text-text-muted">{order.email || 'No email'}</p></div>
          <StatusPill status={order.status} stageColors={stageColors} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div><p className="text-text-muted">Category</p><p className="mt-1 break-words font-bold">{categoryLabels[order.category] || order.category || '—'}</p></div><div><p className="text-text-muted">Created</p><p className="mt-1 font-bold">{order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—'}</p></div></div>
        <button onClick={() => setSelected(order)} className="mt-3 min-h-10 w-full rounded-xl border border-border px-3 text-xs font-black hover:border-accent">Open order details</button>
      </article>)}
      {filtered.length === 0 && <div className="p-8 text-center text-sm font-semibold text-text-muted">No orders match this view.</div>}
    </div>
  </section>;
}
