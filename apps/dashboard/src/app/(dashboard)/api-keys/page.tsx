'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Display raw key once generated
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const data = await apiFetch<{ keys: ApiKey[] }>('/api-keys');
      setKeys(data.keys);
    } catch (err) {
      console.error('Failed to load API keys', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setGeneratedKey(null);
    setFormLoading(true);

    try {
      const data = await apiFetch<{ apiKey: ApiKey; key: string }>('/api-keys', {
        method: 'POST',
        body: {
          name: keyName,
          scopes,
        },
      });

      setKeyName('');
      setGeneratedKey(data.key); // Raw key returned once
      fetchApiKeys();
    } catch (err: any) {
      setFormError(err.message || 'Failed to generate API Key');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('🛑 WARNING: Revoking this API Key will immediately break any CI/CD scripts or applications using it. Are you sure?')) {
      return;
    }

    try {
      await apiFetch(`/api-keys/${keyId}`, { method: 'DELETE' });
      fetchApiKeys();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke key');
    }
  };

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter((s) => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const copyToClipboard = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_CREDENTIAL_STORES...
      </div>
    );
  }

  return (
    <>
      <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-subtitle">Manage access keys for automated CI/CD builds (e.g. GitHub Actions)</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            + Generate Key
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Active API Keys</div>
          <div className="panel-meta">Limit: 10 keys per user</div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Key Name</th>
                <th>Prefix</th>
                <th>Permissions</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink4)' }}>
                    No active API keys found. Generate a key above to enable API automation.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id}>
                    <td className="td-primary">{key.name}</td>
                    <td className="td-mono">{key.keyPrefix}...</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {key.scopes.map((sc) => (
                          <span key={sc} className="badge badge-staging" style={{ fontSize: '9px' }}>
                            {sc}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                    <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => handleRevokeKey(key.id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Generate Key Modal */}
      {isModalOpen && (
        <div className="modal-backdrop open">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Generate API Access Token</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setIsModalOpen(false);
                  setGeneratedKey(null);
                  setFormError(null);
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGenerateKey}>
              <div className="modal-body">
                {formError && <div className="notice notice-danger">❌ {formError}</div>}
                
                {generatedKey && (
                  <div className="notice notice-success" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                    <div style={{ fontWeight: 'bold' }}>⚠️ SAVE THIS SECRET KEY NOW!</div>
                    <p style={{ fontSize: '11px', color: 'var(--ink2)' }}>
                      It will not be displayed again for security reasons.
                    </p>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <input
                        type="text"
                        className="form-input"
                        style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--surface3)' }}
                        value={generatedKey}
                        readOnly
                      />
                      <button type="button" className="btn btn-primary" onClick={copyToClipboard}>
                        {copySuccess ? 'Copied! ✅' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {!generatedKey && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="key-name">Token Name</label>
                      <input
                        id="key-name"
                        type="text"
                        className="form-input"
                        placeholder="e.g. GitHub Actions (Lagos Node)"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        required
                        disabled={formLoading}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Scope Permissions</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {[
                          { value: 'read', label: 'read: Fetch project details and build logs' },
                          { value: 'deploy', label: 'deploy: Trigger new container builds' },
                          { value: 'write', label: 'write: Edit application configs and env properties' },
                          { value: 'billing', label: 'billing: View plans and invoices' },
                        ].map((item) => (
                          <label key={item.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                            <input
                              type="checkbox"
                              checked={scopes.includes(item.value)}
                              onChange={() => toggleScope(item.value)}
                              disabled={formLoading}
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsModalOpen(false);
                    setGeneratedKey(null);
                    setFormError(null);
                  }}
                  disabled={formLoading}
                >
                  {generatedKey ? 'Close' : 'Cancel'}
                </button>
                {!generatedKey && (
                  <button type="submit" className="btn btn-primary" disabled={formLoading}>
                    {formLoading ? 'Generating...' : 'Generate Secret'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
