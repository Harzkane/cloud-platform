'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Deployment {
  id: string;
  status: string;
  commitHash: string;
  commitMsg: string;
  branch: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  liveUrl: string | null;
}

interface Domain {
  id: string;
  domain: string;
  type: string;
  sslStatus: string;
}

interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
}

interface Project {
  id: string;
  name: string;
  gitRepo: string;
  runtime: string;
  buildCmd: string;
  startCmd: string;
  port: number;
  branch: string;
  createdAt: string;
  deployments: Deployment[];
  domains: Domain[];
  environments: Environment[];
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const projectId = id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'deployments' | 'env' | 'domains' | 'settings'>('deployments');

  // Deployment trigger state
  const [deploying, setDeploying] = useState(false);
  const [deployEnv, setDeployEnv] = useState<'PRODUCTION' | 'STAGING'>('PRODUCTION');

  // Environment Variables state
  const [envType, setEnvType] = useState<'PRODUCTION' | 'STAGING'>('PRODUCTION');
  const [envList, setEnvList] = useState<{ key: string; value: string }[]>([]);
  const [saveEnvLoading, setSaveEnvLoading] = useState(false);
  const [envMsg, setEnvMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  // Custom Domains state
  const [newDomain, setNewDomain] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainInstructions, setDomainInstructions] = useState<any>(null);

  // Settings form state
  const [buildCmd, setBuildCmd] = useState('');
  const [startCmd, setStartCmd] = useState('');
  const [port, setPort] = useState(3000);
  const [branch, setBranch] = useState('main');
  const [saveSettingsLoading, setSaveSettingsLoading] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  const fetchProjectDetails = async () => {
    try {
      const data = await apiFetch<{ project: Project }>(`/projects/${projectId}`);
      setProject(data.project);

      // Pre-fill settings
      setBuildCmd(data.project.buildCmd);
      setStartCmd(data.project.startCmd);
      setPort(data.project.port);
      setBranch(data.project.branch);

      // Pre-fill environment variables list
      const envObj = data.project.environments.find((e) => e.name === envType);
      if (envObj && envObj.variables) {
        const list = Object.entries(envObj.variables).map(([key, value]) => ({ key, value }));
        setEnvList(list);
      } else {
        setEnvList([]);
      }
    } catch (err) {
      console.error('Failed to load project details', err);
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  // Sync env list when type changes
  useEffect(() => {
    if (!project) return;
    const envObj = project.environments.find((e) => e.name === envType);
    if (envObj && envObj.variables) {
      const list = Object.entries(envObj.variables).map(([key, value]) => ({ key, value }));
      setEnvList(list);
    } else {
      setEnvList([]);
    }
  }, [envType, project]);

  const handleTriggerDeploy = async () => {
    if (!project) return;
    setDeploying(true);
    try {
      const { deployment } = await apiFetch<{ deployment: Deployment }>('/deployments', {
        method: 'POST',
        body: {
          projectId: project.id,
          environment: deployEnv,
          commitMsg: `Manual trigger (${deployEnv.toLowerCase()})`,
        },
      });
      router.push(`/deployments/${deployment.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to trigger deployment');
      setDeploying(false);
    }
  };

  // Environment Variables Helpers
  const addEnvField = () => {
    setEnvList([...envList, { key: '', value: '' }]);
  };

  const updateEnvField = (index: number, field: 'key' | 'value', val: string) => {
    const copy = [...envList];
    copy[index][field] = val;
    setEnvList(copy);
  };

  const removeEnvField = (index: number) => {
    setEnvList(envList.filter((_, i) => i !== index));
  };

  const handleSaveEnv = async () => {
    setSaveEnvLoading(true);
    setEnvMsg(null);
    try {
      // Convert list to record
      const variables: Record<string, string> = {};
      for (const item of envList) {
        if (item.key.trim()) {
          variables[item.key.trim()] = item.value;
        }
      }

      await apiFetch(`/projects/${projectId}/env/${envType}`, {
        method: 'PUT',
        body: { variables },
      });

      setEnvMsg({ type: 'success', text: `Environment variables for ${envType} saved successfully!` });
      // Refresh local project state
      await fetchProjectDetails();
    } catch (err: any) {
      setEnvMsg({ type: 'danger', text: err.message || 'Failed to save variables' });
    } finally {
      setSaveEnvLoading(false);
    }
  };

  // Domain Management
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError(null);
    setDomainInstructions(null);
    setDomainLoading(true);

    try {
      const data = await apiFetch<{ domain: Domain; instructions: any }>('/domains', {
        method: 'POST',
        body: { projectId, domain: newDomain },
      });
      setNewDomain('');
      setDomainInstructions(data.instructions);
      fetchProjectDetails();
    } catch (err: any) {
      setDomainError(err.message || 'Failed to add domain');
    } finally {
      setDomainLoading(false);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (!confirm('Are you sure you want to remove this domain?')) return;
    try {
      await apiFetch(`/domains/${domainId}`, { method: 'DELETE' });
      fetchProjectDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to remove domain');
    }
  };

  // Settings Management
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSettingsLoading(true);
    setSettingsMsg(null);
    try {
      await apiFetch(`/projects/${projectId}`, {
        method: 'PATCH',
        body: {
          buildCmd,
          startCmd,
          port: Number(port),
          branch,
        },
      });
      setSettingsMsg('Configuration updated successfully.');
      fetchProjectDetails();
    } catch (err: any) {
      setSettingsMsg(`Error: ${err.message}`);
    } finally {
      setSaveSettingsLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm('🛑 WARNING: This will permanently delete your project, deployments, and all domains! This cannot be undone. Are you sure you want to proceed?')) {
      return;
    }
    try {
      await apiFetch(`/projects/${projectId}`, { method: 'DELETE' });
      router.push('/projects');
    } catch (err: any) {
      alert(err.message || 'Failed to delete project');
    }
  };

  if (loading || !project) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_PROJECT_DETAILS...
      </div>
    );
  }

  return (
    <div className="page-fade">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Link href="/projects" style={{ color: 'var(--ink3)' }}>Projects</Link>
            <span style={{ color: 'var(--ink4)' }}>/</span>
            <h1 className="page-title" style={{ margin: 0 }}>{project.name}</h1>
          </div>
          <p className="page-subtitle">
            Repository:{' '}
            <a href={project.gitRepo} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              {project.gitRepo}
            </a>
          </p>
        </div>
        <div className="page-actions">
          <select
            className="form-select"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            value={deployEnv}
            onChange={(e) => setDeployEnv(e.target.value as any)}
            disabled={deploying}
          >
            <option value="PRODUCTION">Deploy Production</option>
            <option value="STAGING">Deploy Staging</option>
          </select>
          <button className="btn btn-primary" onClick={handleTriggerDeploy} disabled={deploying}>
            {deploying ? 'Deploying...' : 'Deploy Now 🚀'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="filter-bar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        <button
          className={`filter-btn ${activeTab === 'deployments' ? 'active' : ''}`}
          onClick={() => setActiveTab('deployments')}
        >
          🚀 Deployments
        </button>
        <button
          className={`filter-btn ${activeTab === 'env' ? 'active' : ''}`}
          onClick={() => setActiveTab('env')}
        >
          🔑 Env Variables
        </button>
        <button
          className={`filter-btn ${activeTab === 'domains' ? 'active' : ''}`}
          onClick={() => setActiveTab('domains')}
        >
          🌐 Domains
        </button>
        <button
          className={`filter-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'deployments' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Deployment History</div>
            <div className="panel-meta">{project.deployments.length} total builds</div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Commit</th>
                  <th>Branch</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {project.deployments.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink4)' }}>
                      No deployments found. Trigger a build above to get started.
                    </td>
                  </tr>
                ) : (
                  project.deployments.map((dep) => (
                    <tr key={dep.id}>
                      <td>
                        <span className={`badge ${
                          dep.status === 'READY' ? 'badge-success' :
                          dep.status === 'FAILED' ? 'badge-danger' :
                          ['QUEUED', 'CLONING', 'BUILDING'].includes(dep.status) ? 'badge-warning' : 'badge-muted'
                        }`}>
                          {dep.status}
                        </span>
                      </td>
                      <td className="td-mono">
                        <Link href={`/deployments/${dep.id}`} className="auth-link">
                          {dep.commitHash.slice(0, 7)}
                        </Link>{' '}
                        · {dep.commitMsg}
                      </td>
                      <td className="td-mono">{dep.branch}</td>
                      <td>{new Date(dep.startedAt).toLocaleString()}</td>
                      <td>{dep.duration ? `${dep.duration}s` : '--'}</td>
                      <td>
                        <Link href={`/deployments/${dep.id}`} className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '11px' }}>
                          Logs
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'env' && (
        <div className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 className="panel-title">Configure Environment Variables</h3>
              <p className="page-subtitle">Inject runtime config safely into your server container</p>
            </div>
            <select
              className="form-select"
              value={envType}
              onChange={(e) => setEnvType(e.target.value as any)}
            >
              <option value="PRODUCTION">Production Environment</option>
              <option value="STAGING">Staging Environment</option>
            </select>
          </div>

          {envMsg && (
            <div className={`notice notice-${envMsg.type}`} style={{ marginBottom: '16px' }}>
              {envMsg.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {envList.map((item, index) => (
              <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                  placeholder="VARIABLE_KEY"
                  value={item.key}
                  onChange={(e) => updateEnvField(index, 'key', e.target.value)}
                />
                <input
                  type="password"
                  className="form-input"
                  style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                  placeholder="variable_value"
                  value={item.value}
                  onChange={(e) => updateEnvField(index, 'value', e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '8px' }}
                  onClick={() => removeEnvField(index)}
                >
                  🗑️
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              onClick={addEnvField}
            >
              + Add Variable
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveEnv}
            disabled={saveEnvLoading}
          >
            {saveEnvLoading ? 'Saving...' : 'Save Config & Redeploy'}
          </button>
        </div>
      )}

      {activeTab === 'domains' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="panel" style={{ padding: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '12px' }}>System Domain</h3>
            <div className="notice notice-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Your project automatically resolves at: <strong>{project.name}.nexgenhost.com</strong>
              </span>
              <a
                href={`http://${project.name}.nexgenhost.com`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--surface)' }}
              >
                Open Site 🌐
              </a>
            </div>
          </div>

          <div className="panel" style={{ padding: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '4px' }}>Add Custom Domain</h3>
            <p className="page-subtitle" style={{ marginBottom: '16px' }}>Requires Pro or Business subscription plan</p>

            {domainError && <div className="notice notice-danger" style={{ marginBottom: '16px' }}>❌ {domainError}</div>}
            {domainInstructions && (
              <div className="notice notice-success" style={{ marginBottom: '16px', flexDirection: 'column', alignItems: 'flex-start' }}>
                <strong style={{ marginBottom: '4px' }}>Domain Added! Configure DNS:</strong>
                <p style={{ fontSize: '11px' }}>Type: {domainInstructions.type}</p>
                <p style={{ fontSize: '11px' }}>Name: {domainInstructions.name}</p>
                <p style={{ fontSize: '11px' }}>Value: {domainInstructions.value}</p>
                <p style={{ fontSize: '10px', marginTop: '6px', color: 'var(--ink2)' }}>{domainInstructions.note}</p>
              </div>
            )}

            <form onSubmit={handleAddDomain} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="form-input"
                style={{ flex: 1 }}
                placeholder="e.g. app.mybusiness.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                required
                disabled={domainLoading}
              />
              <button type="submit" className="btn btn-primary" disabled={domainLoading}>
                {domainLoading ? 'Adding...' : 'Add Domain'}
              </button>
            </form>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Configured Domains</div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Domain Name</th>
                    <th>Type</th>
                    <th>SSL Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {project.domains.map((dom) => (
                    <tr key={dom.id}>
                      <td className="td-primary">{dom.domain}</td>
                      <td>{dom.type === 'subdomain' ? 'System Subdomain' : 'Custom Domain'}</td>
                      <td>
                        <span className={`badge ${dom.sslStatus === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                          {dom.sslStatus}
                        </span>
                      </td>
                      <td>
                        {dom.type === 'custom' ? (
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => handleDeleteDomain(dom.id)}
                          >
                            Remove
                          </button>
                        ) : (
                          <span style={{ color: 'var(--ink4)', fontSize: '11px' }}>System Locked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="panel" style={{ padding: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '12px' }}>Build & Runtime Configuration</h3>
            {settingsMsg && (
              <div className={`notice ${settingsMsg.startsWith('Error') ? 'notice-danger' : 'notice-success'}`} style={{ marginBottom: '16px' }}>
                {settingsMsg}
              </div>
            )}
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="branch-sett">Production Deploy Branch</label>
                  <input
                    id="branch-sett"
                    type="text"
                    className="form-input"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    required
                    disabled={saveSettingsLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="port-sett">Container Port</label>
                  <input
                    id="port-sett"
                    type="number"
                    className="form-input"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    required
                    disabled={saveSettingsLoading}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="build-sett">Build Command</label>
                  <input
                    id="build-sett"
                    type="text"
                    className="form-input"
                    value={buildCmd}
                    onChange={(e) => setBuildCmd(e.target.value)}
                    disabled={saveSettingsLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="start-sett">Start Command</label>
                  <input
                    id="start-sett"
                    type="text"
                    className="form-input"
                    value={startCmd}
                    onChange={(e) => setStartCmd(e.target.value)}
                    disabled={saveSettingsLoading}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start' }}
                disabled={saveSettingsLoading}
              >
                {saveSettingsLoading ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>

          <div className="panel" style={{ border: '1px solid var(--danger)', padding: '20px' }}>
            <h3 className="panel-title" style={{ color: 'var(--danger)', marginBottom: '4px' }}>Danger Zone</h3>
            <p className="page-subtitle" style={{ marginBottom: '16px' }}>Permanently remove this application and all related data resources from Lagos Node</p>
            <button type="button" className="btn btn-danger" onClick={handleDeleteProject}>
              Delete Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
