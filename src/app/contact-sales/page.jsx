'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import InfoPageShell from '@/components/InfoPageShell';
import LocationPicker from '@/components/LocationPicker';
import { CATEGORIES, CATEGORY_FIELDS, generateOrderId } from '@/lib/orderCategories';

const channels = [
  {
    title: 'Sales Email',
    icon: 'mail',
    value: 'ahemanthramasai@gmail.com',
    href: 'mailto:ahemanthramasai@gmail.com?subject=Smart%20Home%20Sales%20Inquiry'
  },
  {
    title: 'Pre-Orders & Retrofitting',
    icon: 'local_shipping',
    value: '4-device relay modules, custom PCB quotes, and bulk pricing.',
    href: '/partner-program'
  },
  {
    title: 'Response Time',
    icon: 'schedule',
    value: 'We respond to all inquiries within 24 hours on business days.',
    href: null
  }
];

const inputClass =
  'px-4 py-3 rounded bg-lp-surface-lowest border border-lp-outline-variant text-sm text-white outline-none focus:border-lp-primary-container transition-colors placeholder:text-lp-on-surface-variant/60';

export default function ContactSalesPage() {
  const router = useRouter();
  const [category, setCategory] = useState('home');
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [details, setDetails] = useState({});
  const [location, setLocation] = useState({ lat: null, lng: null, address: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleDetailChange = (key, value) => {
    setDetails({ ...details, [key]: value });
  };

  const handleCategoryChange = (id) => {
    setCategory(id);
    setDetails({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('sending');

    const webhook = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    if (!webhook) {
      setError('Order service is not configured yet. Please email us directly for now.');
      setStatus('idle');
      return;
    }

    const orderId = generateOrderId();
    const payload = {
      order_id: orderId,
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      category,
      details,
      address: location.address,
      lat: location.lat,
      lng: location.lng
    };

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Webhook responded with ${res.status}`);
      router.push(`/track/${orderId}`);
    } catch (err) {
      console.error('n8n webhook error:', err);
      setError('Could not reach the order service. Please try again or email us directly.');
      setStatus('idle');
    }
  };

  const fields = CATEGORY_FIELDS[category] || [];

  return (
    <InfoPageShell
      badge="Talk to Us"
      title="Contact Sales"
      subtitle="Tell us about your space and we will send you a custom quote. Every inquiry gets a unique tracking link to follow your project."
    >
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Contact Channels */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {channels.map((channel, index) => (
            <div key={index} className="p-6 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/35 transition-all rounded-xl flex gap-4 items-start">
              <span className="material-symbols-outlined text-lp-primary-container text-2xl mt-0.5 shrink-0">{channel.icon}</span>
              <div>
                <h3 className="font-label-caps text-xs font-bold text-white uppercase tracking-wider mb-1">{channel.title}</h3>
                {channel.href ? (
                  <a href={channel.href} className="text-xs font-body-md text-lp-primary-container leading-relaxed hover:underline">{channel.value}</a>
                ) : (
                  <p className="text-xs font-body-md text-lp-on-surface-variant leading-relaxed">{channel.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Inquiry Form */}
        <div className="lg:col-span-8 p-8 md:p-10 bg-lp-surface-low border border-lp-outline-variant rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-lp-primary-container/5 blur-[120px] rounded-full pointer-events-none"></div>

          <h2 className="text-2xl font-headline-sm font-bold text-white mb-2">Send an Inquiry</h2>
          <p className="text-xs font-body-md text-lp-on-surface-variant mb-8">Pick the category that matches your project — the form adapts to ask exactly what we need.</p>

          {status === 'success' ? (
            <div className="px-6 py-4 bg-lp-primary-container/10 border border-lp-primary-container/40 rounded font-data-point text-lp-primary-container text-sm font-bold">
              Message sent! Our sales team will get back to you within 24 hours.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6 relative z-10">
              {/* Category Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`p-4 rounded-lg border text-left transition-all active:scale-[0.98] cursor-pointer ${
                      category === cat.id
                        ? 'border-lp-primary-container bg-lp-primary-container/10 shadow-[0_0_15px_rgba(0,255,65,0.15)]'
                        : 'border-lp-outline-variant bg-lp-surface-lowest hover:border-lp-outline'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lp-primary-container text-xl block mb-2">{cat.icon}</span>
                    <span className="font-label-caps text-xs font-bold text-white uppercase tracking-wide block">{cat.label}</span>
                    <span className="text-[10px] text-lp-on-surface-variant mt-1 block">{cat.desc}</span>
                  </button>
                ))}
              </div>

              {/* Contact Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-label-caps text-lp-on-surface-variant uppercase tracking-wider">Full Name *</label>
                  <input name="full_name" value={form.full_name} onChange={handleChange} required placeholder="Your name" className={inputClass} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-label-caps text-lp-on-surface-variant uppercase tracking-wider">Email *</label>
                  <input name="email" type="email" value={form.email} onChange={handleChange} required placeholder="you@company.com" className={inputClass} />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-xs font-label-caps text-lp-on-surface-variant uppercase tracking-wider">Phone / WhatsApp *</label>
                  <input name="phone" type="tel" value={form.phone} onChange={handleChange} required placeholder="+91 98765 43210" className={inputClass} />
                </div>
              </div>

              {/* Category-Specific Fields */}
              {fields.length > 0 && (
                <div className="flex flex-col gap-4">
                  <span className="text-xs font-label-caps text-lp-primary-container uppercase tracking-widest">Project Details</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map((field) => (
                      <div key={field.key} className={`flex flex-col gap-1.5 ${field.key === 'projectName' || field.key === 'cities' ? 'md:col-span-2' : ''}`}>
                        <label className="text-xs font-label-caps text-lp-on-surface-variant uppercase tracking-wider">{field.label}</label>
                        {field.type === 'select' ? (
                          <select
                            value={details[field.key] || ''}
                            onChange={(e) => handleDetailChange(field.key, e.target.value)}
                            required
                            className={`${inputClass} cursor-pointer`}
                          >
                            <option value="" disabled>Select...</option>
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            value={details[field.key] || ''}
                            onChange={(e) => handleDetailChange(field.key, e.target.value)}
                            required
                            placeholder={field.placeholder}
                            className={inputClass}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Location Map */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-label-caps text-lp-primary-container uppercase tracking-widest">Installation Location</span>
                <LocationPicker value={location} onChange={setLocation} />
              </div>

              <button
                type="submit"
                disabled={status === 'sending'}
                className="self-start px-8 py-3 bg-lp-primary-container text-lp-on-primary-container font-label-caps font-bold text-xs hover:shadow-[0_0_20px_rgba(0,255,65,0.35)] transition-all cursor-pointer rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'sending' ? 'Booking...' : 'Book & Get Tracking Link'}
              </button>

              {error && <p className="text-xs font-bold text-red-400">{error}</p>}
            </form>
          )}
        </div>
      </div>
    </InfoPageShell>
  );
}