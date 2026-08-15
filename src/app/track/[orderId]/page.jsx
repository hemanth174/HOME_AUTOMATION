'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import InfoPageShell from '@/components/InfoPageShell';
import { supabase } from '@/lib/supabase';
import { STAGES, CATEGORY_LABELS, DETAIL_LABELS } from '@/lib/orderCategories';

const STAGE_ICONS = {
  Received: 'inbox',
  Survey: 'map',
  Quoting: 'request_quote',
  Manufacturing: 'precision_manufacturing',
  Shipping: 'local_shipping',
  Installed: 'task_alt'
};

export default function TrackOrderPage() {
  const params = useParams();
  const orderId = (params?.orderId || '').toString().toUpperCase();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchOrder = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const { data, error } = await supabase
          .from('order_trackings')
          .select('*')
          .eq('order_id', orderId)
          .maybeSingle();
        if (!active) return;
        if (error) throw error;
        if (!data) setNotFound(true);
        else setOrder(data);
      } catch (err) {
        console.error('Tracking fetch error:', err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (orderId) fetchOrder();
    return () => { active = false; };
  }, [orderId]);

  const currentIndex = order ? STAGES.indexOf(order.status) : -1;
  const details = order?.details || {};

  return (
    <InfoPageShell
      badge={orderId ? `Order ${orderId}` : 'Project Tracking'}
      title="Track Your Project"
      subtitle="Follow your Electric Warriors installation from inquiry to switch-on."
    >
      {loading ? (
        <div className="max-w-3xl mx-auto text-center py-16">
          <span className="material-symbols-outlined text-lp-primary-container text-4xl animate-spin inline-block">autorenew</span>
          <p className="text-sm font-body-md text-lp-on-surface-variant mt-4">Fetching your project status...</p>
        </div>
      ) : notFound || !order ? (
        <div className="max-w-xl mx-auto text-center p-10 bg-lp-surface-low border border-lp-outline-variant rounded-xl">
          <span className="material-symbols-outlined text-lp-on-surface-variant text-4xl block mb-4">search_off</span>
          <h3 className="text-xl font-headline-sm font-bold text-white mb-2">Order Not Found</h3>
          <p className="text-xs font-body-md text-lp-on-surface-variant leading-relaxed mb-6">
            We could not find a project with ID <span className="font-data-point text-lp-primary-container font-bold">{orderId}</span>. Check the link from your confirmation email — it may take a few minutes after booking.
          </p>
          <Link
            href="/contact-sales"
            className="inline-block px-6 py-3 bg-lp-primary-container text-lp-on-primary-container font-label-caps font-bold text-xs hover:shadow-[0_0_20px_rgba(0,255,65,0.35)] transition-all rounded"
          >
            Book a New Inquiry
          </Link>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          {/* Status Header */}
          <div className="p-8 bg-lp-surface-low border border-lp-outline-variant rounded-xl flex flex-col md:flex-row md:items-center gap-6 justify-between">
            <div>
              <span className="text-[10px] font-label-caps text-lp-on-surface-variant uppercase tracking-widest block mb-1">Current Status</span>
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-lp-primary-container text-2xl">{STAGE_ICONS[order.status] || 'inbox'}</span>
                <h3 className="text-2xl font-headline-sm font-bold text-lp-primary-container">{order.status}</h3>
              </div>
              <p className="text-xs font-body-md text-lp-on-surface-variant mt-2">
                {CATEGORY_LABELS[order.category] || order.category} &middot; booked on {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="px-6 py-4 bg-lp-surface-lowest border border-lp-primary-container/25 rounded font-data-point text-lp-primary-container text-lg font-bold select-none">
              {order.order_id}
            </div>
          </div>

          {/* Progress Timeline */}
          <div className="p-8 md:p-10 bg-lp-surface-low border border-lp-outline-variant rounded-xl">
            <h4 className="text-xs font-label-caps text-white uppercase tracking-widest mb-8">Project Progress</h4>
            <div className="relative">
              <div className="absolute top-6 left-3 right-3 h-0.5 bg-lp-outline-variant rounded" />
              <div
                className="absolute top-6 left-3 h-0.5 bg-lp-primary-container rounded transition-all duration-700"
                style={{ width: currentIndex >= 0 ? `calc(${(currentIndex / (STAGES.length - 1)) * 100}% - 0px)` : '0%' }}
              />
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 relative">
                {STAGES.map((stage, idx) => {
                  const done = idx < currentIndex;
                  const active = idx === currentIndex;
                  return (
                    <div key={stage} className="flex flex-col items-center text-center gap-2">
                      <div
                        className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                          active
                            ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container lp-active-glow'
                            : done
                              ? 'bg-lp-primary-container/20 text-lp-primary-container border-lp-primary-container/60'
                              : 'bg-lp-surface-lowest text-lp-on-surface-variant border-lp-outline-variant'
                        }`}
                      >
                        {done ? (
                          <span className="material-symbols-outlined text-lg">check</span>
                        ) : (
                          <span className="material-symbols-outlined text-lg">{STAGE_ICONS[stage]}</span>
                        )}
                      </div>
                      <span className={`text-[9px] md:text-[10px] font-label-caps uppercase tracking-wide ${active ? 'text-lp-primary-container font-bold' : done ? 'text-white' : 'text-lp-on-surface-variant'}`}>
                        {stage}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* History */}
            {Array.isArray(order.status_history) && order.status_history.length > 0 && (
              <div className="mt-10 border-t border-lp-outline-variant pt-6 flex flex-col gap-3">
                <span className="text-[10px] font-label-caps text-lp-on-surface-variant uppercase tracking-widest">Update History</span>
                {order.status_history.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full bg-lp-primary-container"></span>
                    <span className="text-xs font-semibold text-white">{entry.status}</span>
                    <span className="text-[10px] text-lp-on-surface-variant">
                      {new Date(entry.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant rounded-xl">
              <h4 className="text-xs font-label-caps text-white uppercase tracking-widest mb-6">Project Details</h4>
              <div className="flex flex-col gap-3.5">
                <div>
                  <span className="text-[10px] font-label-caps text-lp-on-surface-variant uppercase tracking-wide block">Contact</span>
                  <span className="text-sm font-semibold text-white">{order.full_name} {order.phone && <span className="text-lp-on-surface-variant font-normal">· {order.phone}</span>}</span>
                </div>
                <div>
                  <span className="text-[10px] font-label-caps text-lp-on-surface-variant uppercase tracking-wide block">Category</span>
                  <span className="text-sm font-semibold text-white">{CATEGORY_LABELS[order.category] || order.category}</span>
                </div>
                {Object.entries(details).map(([key, val]) =>
                  val ? (
                    <div key={key}>
                      <span className="text-[10px] font-label-caps text-lp-on-surface-variant uppercase tracking-wide block">{DETAIL_LABELS[key] || key}</span>
                      <span className="text-sm font-semibold text-white">{String(val)}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant rounded-xl">
              <h4 className="text-xs font-label-caps text-white uppercase tracking-widest mb-6">Installation Location</h4>
              {order.lat != null && order.lng != null ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-4 items-start group"
                >
                  <span className="material-symbols-outlined text-lp-primary-container text-2xl mt-0.5">location_on</span>
                  <span className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed group-hover:text-lp-primary-container transition-colors">
                    {order.address || `${order.lat.toFixed(5)}, ${order.lng.toFixed(5)}`}
                    <span className="block text-[10px] font-label-caps text-lp-primary-container uppercase tracking-wide mt-1">Open in Google Maps →</span>
                  </span>
                </a>
              ) : (
                <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed">{order.address || 'No location provided.'}</p>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] font-label-caps text-lp-on-surface-variant opacity-70 uppercase tracking-widest">
            Questions about your order? Email ahemanthramasai@gmail.com
          </p>
        </div>
      )}
    </InfoPageShell>
  );
}