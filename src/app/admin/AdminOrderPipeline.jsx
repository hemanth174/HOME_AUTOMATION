"use client";

import { ChevronDown, Inbox, Layers, Search, Sparkles, X } from "lucide-react";

function StatusPill({ status, stageColors }) {
  const colorClass = stageColors[status] || stageColors.Received;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${colorClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
}

export default function AdminOrderPipeline({
  filtered,
  orders,
  query,
  setQuery,
  filter,
  setFilter,
  setSelected,
  stages,
  categoryLabels,
  stageColors,
}) {
  const activeCount = orders.filter((o) => o.status !== "Installed").length;
  const installedCount = orders.filter((o) => o.status === "Installed").length;

  return (
    <section className="space-y-4">
      {/* Metric Highlights */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Total Inquiries</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-text sm:text-3xl">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">In Pipeline</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-amber-500 sm:text-3xl">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500">Completed & Live</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-emerald-500 sm:text-3xl">{installedCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">Matching View</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-purple-600 dark:text-purple-400 sm:text-3xl">{filtered.length}</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Controls Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-accent" />
              <h2 className="text-base font-black text-text sm:text-lg">Project Inquiries</h2>
            </div>
            <p className="mt-0.5 text-xs font-medium text-text-muted">
              Showing {filtered.length} of {orders.length} total customer projects
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative min-w-0 flex-1 sm:w-72">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ID, customer, email…"
                className="min-h-11 w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-9 text-xs font-semibold text-text outline-none transition focus:border-accent"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Stage Selector */}
            <div className="relative min-w-0 sm:w-48">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="min-h-11 w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-3.5 pr-9 text-xs font-black text-text outline-none transition focus:border-accent"
              >
                <option value="All stages">All Stages</option>
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
            </div>
          </div>
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-border bg-background/50 text-[10px] font-black uppercase tracking-[.18em] text-text-muted">
              <tr>
                <th className="px-5 py-3.5">Order ID</th>
                <th className="px-5 py-3.5">Customer & Email</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Current Stage</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((order) => (
                <tr
                  key={order.id || order.order_id}
                  onClick={() => setSelected(order)}
                  className="cursor-pointer transition-colors hover:bg-accent/5"
                >
                  <td className="px-5 py-4 font-mono text-xs font-black">
                    <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-400">
                      {order.order_id}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-text">{order.full_name || "Unknown Customer"}</p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-text-muted">
                      {order.email || "No email provided"}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold text-text-muted">
                    {categoryLabels[order.category] || order.category || "—"}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={order.status} stageColors={stageColors} />
                  </td>
                  <td className="px-5 py-4 font-mono text-xs font-medium text-text-muted">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(order);
                      }}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-background px-3.5 text-xs font-black text-text transition hover:border-accent hover:text-accent"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox size={32} className="text-text-muted/60" />
              <p className="mt-3 text-sm font-black text-text">No orders found</p>
              <p className="mt-1 text-xs text-text-muted">Try adjusting your search query or stage filter.</p>
            </div>
          )}
        </div>

        {/* Mobile Interactive Card Deck (< 768px) */}
        <div className="space-y-3 p-3 md:hidden">
          {filtered.map((order) => (
            <article
              key={order.id || order.order_id}
              onClick={() => setSelected(order)}
              className="cursor-pointer rounded-2xl border border-border bg-background p-4 shadow-sm transition active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-block rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-black text-cyan-700 dark:text-cyan-400">
                    {order.order_id}
                  </span>
                  <h3 className="mt-2 truncate text-base font-black text-text">
                    {order.full_name || "Unknown Customer"}
                  </h3>
                  <p className="truncate font-mono text-xs text-text-muted">{order.email || "No email"}</p>
                </div>
                <StatusPill status={order.status} stageColors={stageColors} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-card/60 p-2.5 text-[11px]">
                <div>
                  <span className="text-text-muted">Category</span>
                  <p className="mt-0.5 truncate font-bold text-text">
                    {categoryLabels[order.category] || order.category || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Created</span>
                  <p className="mt-0.5 font-mono font-bold text-text">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN") : "—"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(order);
                }}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-black text-text transition hover:border-accent"
              >
                View & Advance Stage
              </button>
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox size={28} className="text-text-muted/60" />
              <p className="mt-3 text-sm font-black text-text">No orders found</p>
              <p className="mt-1 text-xs text-text-muted">Try adjusting your search query or stage filter.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
