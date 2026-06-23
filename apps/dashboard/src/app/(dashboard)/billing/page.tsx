'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, getStoredUser } from '@/lib/api';

interface Subscription {
  id: string;
  plan: string;
  status: string;
  paystackRef: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

interface Usage {
  projects: number;
}

export default function BillingPage() {
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState('STARTER');
  const [usage, setUsage] = useState<Usage>({ projects: 0 });
  const [invoices, setInvoices] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    fetchBillingDetails();
  }, []);

  const fetchBillingDetails = async () => {
    try {
      const subData = await apiFetch<{ subscription: Subscription | null; currentPlan: string; usage: Usage }>('/billing/subscription');
      setSubscription(subData.subscription);
      setCurrentPlan(subData.currentPlan || 'STARTER');
      setUsage(subData.usage || { projects: 0 });

      const invData = await apiFetch<{ invoices: Subscription[] }>('/billing/invoices');
      setInvoices(invData.invoices);
    } catch (err) {
      console.error('Failed to load billing details', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (plan: 'STARTER' | 'PRO' | 'BUSINESS') => {
    setCheckoutLoading(plan);
    try {
      const { checkoutUrl } = await apiFetch<{ checkoutUrl: string }>('/billing/checkout', {
        method: 'POST',
        body: { plan },
      });
      // Redirect user to Paystack checkout page
      window.location.href = checkoutUrl;
    } catch (err: any) {
      alert(err.message || 'Failed to initialize Paystack checkout');
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_BILLING_PORTAL...
      </div>
    );
  }

  const plans = [
    {
      code: 'STARTER',
      name: 'Starter Plan',
      price: '₦5,000',
      period: 'per month',
      features: [
        'Up to 5 Projects',
        '2 Managed Databases',
        '50 GB Bandwidth',
        'Shared Worker Nodes',
        'Nigeria Lagos Region',
      ],
    },
    {
      code: 'PRO',
      name: 'Pro Plan',
      price: '₦15,000',
      period: 'per month',
      features: [
        'Up to 20 Projects',
        '10 Managed Databases',
        '200 GB Bandwidth',
        'Dedicated Worker Node',
        'Custom Domain SSL Support',
      ],
    },
    {
      code: 'BUSINESS',
      name: 'Business Plan',
      price: '₦45,000',
      period: 'per month',
      features: [
        'Unlimited Projects',
        '30 Managed Databases',
        '1 TB Bandwidth',
        'Dedicated Multi-Node Clustering',
        'Priority WAT support',
      ],
    },
  ];

  return (
    <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing & Subscription</h1>
          <p className="page-subtitle">Manage plan limits and Paystack billing configurations</p>
        </div>
      </div>

      {/* Current plan card */}
      <div className="panel" style={{ padding: '20px' }}>
        <h3 className="panel-title" style={{ marginBottom: '8px' }}>Active Subscription</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent)' }}>
              {currentPlan} TIER
            </div>
            <p style={{ color: 'var(--ink3)', marginTop: '4px' }}>
              {subscription
                ? `Active subscription code: ${subscription.paystackRef} · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : 'Free tier sandbox environment. Upgrade below to deploy custom domains and dedicated clusters.'}
            </p>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '20px', minWidth: '160px' }}>
            <div className="df-label">Project usage</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
              {usage.projects} / {currentPlan === 'STARTER' ? 5 : currentPlan === 'PRO' ? 20 : 'Unlimited'}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="grid-3">
        {plans.map((p) => {
          const isActive = currentPlan === p.code;
          return (
            <div
              key={p.code}
              className="panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                position: 'relative',
              }}
            >
              {isActive && (
                <span
                  className="badge badge-success"
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 0 10px var(--brand-glow)',
                  }}
                >
                  Active Plan
                </span>
              )}
              <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{p.name}</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--ink)', margin: '12px 0 4px' }}>{p.price}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{p.period}</div>
              </div>
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {p.features.map((f, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ink2)' }}>
                    <span style={{ color: 'var(--accent)' }}>✓</span> {f}
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                {isActive ? (
                  <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} disabled>
                    Current Plan
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleCheckout(p.code as any)}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === p.code ? 'Initializing Checkout...' : `Upgrade to ${p.code}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invoice history */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Billing Invoices</div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice Code</th>
                <th>Plan Level</th>
                <th>Status</th>
                <th>Period Start</th>
                <th>Period End</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink4)' }}>
                    No invoice transactions recorded on this account.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="td-mono">{inv.paystackRef}</td>
                    <td className="td-primary">{inv.plan}</td>
                    <td>
                      <span className={`badge ${inv.status === 'ACTIVE' ? 'badge-success' : 'badge-muted'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>{new Date(inv.currentPeriodStart).toLocaleDateString()}</td>
                    <td>{new Date(inv.currentPeriodEnd).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
