'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getMockLogs, parseRealLogs } from '@/lib/mockLogs';
import { getStepIndicator, isDeploymentInProgress } from '@/lib/deploySteps';

interface Project {
  id: string;
  name: string;
  gitRepo: string;
  runtime: string;
  branch: string;
  port: number;
  createdAt: string;
  _count: { deployments: number };
  deployments: {
    id: string;
    status: string;
    startedAt: string;
    liveUrl: string | null;
    commitHash?: string;
    environment?: { name: string };
  }[];
  domains: { domain: string; type: string; sslStatus: string }[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // New Project Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [runtime, setRuntime] = useState('node:20-alpine');
  const [buildCmd, setBuildCmd] = useState('npm run build');
  const [startCmd, setStartCmd] = useState('npm start');
  const [port, setPort] = useState(3000);
  const [branch, setBranch] = useState('main');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Project Drawer State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [drawerProject, setDrawerProject] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Inline Env Edit State
  const [isEditingEnv, setIsEditingEnv] = useState(false);
  const [envList, setEnvList] = useState<{ key: string; value: string }[]>([]);
  const [saveEnvLoading, setSaveEnvLoading] = useState(false);
  const [envMsg, setEnvMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    // If the query param new=true is passed, open the create modal
    if (searchParams.get('new') === 'true') {
      setIsModalOpen(true);
    }
    fetchProjects();
  }, [searchParams]);

  // Load project details dynamically when drawer is opened
  useEffect(() => {
    if (selectedProjectId) {
      setDrawerLoading(true);
      setDrawerProject(null);
      apiFetch<{ project: any }>(`/projects/${selectedProjectId}`)
        .then((data) => {
          setDrawerProject(data.project);
        })
        .catch((err) => {
          console.error('Failed to load project details', err);
        })
        .finally(() => {
          setDrawerLoading(false);
        });
    } else {
      setDrawerProject(null);
    }
  }, [selectedProjectId]);

  // Poll drawer while a deployment is in progress
  useEffect(() => {
    if (!selectedProjectId || !drawerProject?.deployments?.[0]) return;
    const status = drawerProject.deployments[0].status;
    if (!isDeploymentInProgress(status)) return;

    const interval = setInterval(() => {
      apiFetch<{ project: any }>(`/projects/${selectedProjectId}`)
        .then((data) => {
          setDrawerProject(data.project);
          fetchProjects();
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedProjectId, drawerProject?.deployments?.[0]?.status]);

  const fetchProjects = async () => {
    try {
      const data = await apiFetch<{ projects: Project[] }>('/projects');
      setProjects(data.projects);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      // 1. Create the project
      const { project } = await apiFetch<{ project: Project }>('/projects', {
        method: 'POST',
        body: {
          name,
          gitRepo,
          runtime,
          buildCmd,
          startCmd,
          port: Number(port),
          branch,
        },
      });

      // 2. Close modal & refresh list immediately — project is created
      setIsModalOpen(false);
      setName('');
      setGitRepo('');
      setRuntime('node:20-alpine');
      setBuildCmd('npm run build');
      setStartCmd('npm start');
      setPort(3000);
      setBranch('main');
      setFormLoading(false);
      // Notify sidebar to refresh badge counts immediately
      window.dispatchEvent(new Event('sidebar:refresh'));
      router.replace('/projects');
      fetchProjects();

      // 3. Trigger the initial production deployment (best-effort — won't block UI)
      apiFetch('/deployments', {
        method: 'POST',
        body: {
          projectId: project.id,
          environment: 'PRODUCTION',
          commitMsg: 'Initial automated build',
        },
      }).catch((depErr) => {
        // Deployment kick-off failed (e.g., Redis unavailable) — project still exists.
        // User can retry from the project drawer.
        console.warn('Initial deployment trigger failed:', depErr);
      });
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project');
      setFormLoading(false);
    }
  };

  // --- Env Edit Handlers ---
  const handleEditEnvClick = () => {
    setIsEditingEnv(true);
    setEnvMsg(null);
    const prodEnv = drawerProject?.environments?.find((e: any) => e.name === 'PRODUCTION');
    const vars = prodEnv?.variables || {};
    const list = Object.keys(vars).map((k) => ({ key: k, value: vars[k] }));
    setEnvList(list.length > 0 ? list : [{ key: '', value: '' }]);
  };

  const handleCancelEnvEdit = () => {
    setIsEditingEnv(false);
    setEnvMsg(null);
  };

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
    if (!drawerProject) return;
    setSaveEnvLoading(true);
    setEnvMsg(null);
    try {
      const variables: Record<string, string> = {};
      for (const item of envList) {
        if (item.key.trim()) {
          variables[item.key.trim()] = item.value;
        }
      }

      await apiFetch(`/projects/${drawerProject.id}/env/PRODUCTION`, {
        method: 'PUT',
        body: { variables },
      });

      setEnvMsg({ type: 'success', text: 'Environment variables saved!' });
      
      // Refresh drawer details
      const data = await apiFetch<{ project: any }>(`/projects/${drawerProject.id}`);
      setDrawerProject(data.project);
      
      // Close editing after a short delay
      setTimeout(() => {
        setIsEditingEnv(false);
        setEnvMsg(null);
      }, 2000);
    } catch (err: any) {
      setEnvMsg({ type: 'danger', text: err.message || 'Failed to save variables' });
    } finally {
      setSaveEnvLoading(false);
    }
  };

  // Filter projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.gitRepo.toLowerCase().includes(search.toLowerCase());

    const lastStatus = project.deployments[0]?.status || 'NO_DEPLOYS';
    
    if (filter === 'ALL') return matchesSearch;
    if (filter === 'READY') return matchesSearch && lastStatus === 'READY';
    if (filter === 'BUILDING') return matchesSearch && ['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING'].includes(lastStatus);
    if (filter === 'FAILED') return matchesSearch && lastStatus === 'FAILED';
    if (filter === 'STOPPED') return matchesSearch && lastStatus === 'STOPPED';
    return matchesSearch;
  });

  // Sort projects by last deploy date descending (newest first)
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const timeA = a.deployments[0] ? new Date(a.deployments[0].startedAt).getTime() : 0;
    const timeB = b.deployments[0] ? new Date(b.deployments[0].startedAt).getTime() : 0;
    return timeB - timeA;
  });

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_PROJECTS_CATALOG...
      </div>
    );
  }

  return (
    <>
      <div className="page-fade">
        <div className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">Manage your cloud deployments and runtime instances</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              + New Project
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="panel" style={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="filter-bar">
              <span className="filter-label">Filter:</span>
              {['ALL', 'READY', 'BUILDING', 'FAILED', 'STOPPED'].map((type) => (
                <button
                  key={type}
                  className={`filter-btn ${filter === type ? 'active' : ''}`}
                  onClick={() => setFilter(type)}
                >
                  {type}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="Search projects by name, repo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Projects Table */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">All Projects</div>
            <div className="panel-meta">Sorted by last deploy</div>
          </div>

          {sortedProjects.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink4)' }}>
              No projects found matching the criteria.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Environment</th>
                  <th>Domain</th>
                  <th>Last Deploy</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((project) => {
                  const lastDeploy = project.deployments[0];
                  const status = lastDeploy?.status || 'NO_DEPLOYS';
                  const envName = lastDeploy?.environment?.name || 'PRODUCTION';

                  const primaryDomain = project.domains?.find(d => d.type === 'custom')?.domain ||
                                        project.domains?.find(d => d.type === 'subdomain')?.domain ||
                                        lastDeploy?.liveUrl || '';

                  let lastDeployText = 'No deployments';
                  if (lastDeploy) {
                    const relativeTime = getRelativeTime(lastDeploy.startedAt);
                    const commitHash = lastDeploy.commitHash ? lastDeploy.commitHash.slice(0, 7) : 'HEAD';
                    lastDeployText = `${relativeTime} · ${commitHash}`;
                  }

                  // Status Badge class and label
                  const isSuccess = status === 'READY' || status === 'RUNNING';
                  const isFailed = status === 'FAILED';
                  const isBuilding = ['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING'].includes(status);
                  
                  let badgeClass = 'badge-muted';
                  let statusDotClass = 'dot-muted';
                  let statusLabel = status;
                  if (isSuccess) {
                    badgeClass = 'badge-success';
                    statusDotClass = 'dot-success';
                    statusLabel = 'Deployed';
                  } else if (isFailed) {
                    badgeClass = 'badge-danger';
                    statusDotClass = 'dot-danger';
                    statusLabel = 'Failed';
                  } else if (isBuilding) {
                    badgeClass = 'badge-warning';
                    statusDotClass = 'dot-warning';
                    statusLabel = 'Building';
                  } else if (status === 'STOPPED') {
                    badgeClass = 'badge-muted';
                    statusDotClass = 'dot-muted';
                    statusLabel = 'Stopped';
                  }

                  return (
                    <tr
                      key={project.id}
                      className="clickable"
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <td>
                        <div className="td-primary">{project.name}</div>
                        <div className="td-mono">{project.gitRepo.replace('https://github.com/', 'github: ')}</div>
                      </td>
                      <td>
                        <span className={`badge ${envName === 'PRODUCTION' ? 'badge-success' : 'badge-staging'}`}>
                          {envName === 'PRODUCTION' ? 'Production' : 'Staging'}
                        </span>
                      </td>
                      <td className="td-mono">
                        {primaryDomain ? (
                          <span style={{ color: 'var(--accent)' }}>{primaryDomain}</span>
                        ) : (
                          <span style={{ color: 'var(--ink4)' }}>-</span>
                        )}
                      </td>
                      <td className="td-mono">{lastDeployText}</td>
                      <td>
                        <span className={`badge ${badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span className={`status-dot ${statusDotClass}`} style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                          {statusLabel}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '3px 10px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (lastDeploy) {
                              router.push(`/deployments/${lastDeploy.id}`);
                            } else {
                              router.push(`/projects/${project.id}`);
                            }
                          }}
                        >
                          {isBuilding ? 'View' : 'Deploy'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {isModalOpen && (
          <div className="modal-backdrop open">
            <div className="modal">
              <div className="modal-header">
                <h2 className="modal-title">Launch New Project</h2>
                <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                  &times;
                </button>
              </div>
              <form onSubmit={handleCreateProject}>
                <div className="modal-body">
                  {formError && <div className="notice notice-danger">❌ {formError}</div>}

                  <div className="form-group">
                    <label className="form-label" htmlFor="proj-name">Project Name</label>
                    <input
                      id="proj-name"
                      type="text"
                      className="form-input"
                      placeholder="my-awesome-service"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      pattern="^[a-z0-9-]+$"
                      title="Lowercase letters, numbers, hyphens only"
                      disabled={formLoading}
                    />
                    <span className="form-hint">Must be URL-friendly (e.g. lowercase, hyphens only)</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="proj-git">GitHub Repository URL</label>
                    <input
                      id="proj-git"
                      type="url"
                      className="form-input"
                      placeholder="https://github.com/username/repo"
                      value={gitRepo}
                      onChange={(e) => setGitRepo(e.target.value)}
                      required
                      disabled={formLoading}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="proj-runtime">Runtime Environment</label>
                      <select
                        id="proj-runtime"
                        className="form-select"
                        value={runtime}
                        onChange={(e) => setRuntime(e.target.value)}
                        disabled={formLoading}
                      >
                        <option value="node:20-alpine">Node.js 20 (Alpine)</option>
                        <option value="go:1.22-alpine">Go 1.22 (Alpine)</option>
                        <option value="python:3.11-alpine">Python 3.11 (Alpine)</option>
                        <option value="dockerfile">Custom Dockerfile</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="proj-branch">Git Branch</label>
                      <input
                        id="proj-branch"
                        type="text"
                        className="form-input"
                        placeholder="main"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        disabled={formLoading}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="proj-build">Build Command</label>
                      <input
                        id="proj-build"
                        type="text"
                        className="form-input"
                        placeholder="npm run build"
                        value={buildCmd}
                        onChange={(e) => setBuildCmd(e.target.value)}
                        disabled={formLoading}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="proj-start">Start Command</label>
                      <input
                        id="proj-start"
                        type="text"
                        className="form-input"
                        placeholder="npm start"
                        value={startCmd}
                        onChange={(e) => setStartCmd(e.target.value)}
                        disabled={formLoading}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="proj-port">Internal Port</label>
                    <input
                      id="proj-port"
                      type="number"
                      className="form-input"
                      placeholder="3000"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      required
                      min={1}
                      max={65535}
                      disabled={formLoading}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={formLoading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={formLoading}>
                    {formLoading ? 'Creating...' : 'Create & Deploy'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* Project Detail Drawer Backdrop */}
      <div
        className={`drawer-backdrop ${selectedProjectId ? 'open' : ''}`}
        onClick={() => setSelectedProjectId(null)}
      />

      {/* Project Detail Drawer */}
      <div className={`drawer ${selectedProjectId ? 'open' : ''}`}>
        <div className="drawer-header">
          {(() => {
            const basicProject = projects.find(p => p.id === selectedProjectId);
            if (!basicProject) return null;
            return (
              <>
                <div>
                  <div className="drawer-title">{basicProject.name}</div>
                  <div className="drawer-subtitle">
                    Project Details · {basicProject.gitRepo.replace('https://github.com/', '')}
                  </div>
                </div>
                <button className="drawer-close" onClick={() => setSelectedProjectId(null)}>✕</button>
              </>
            );
          })()}
        </div>

        <div className="drawer-body">
          {drawerLoading && (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--ink4)'
            }}>
              LOADING_PROJECT_DETAILS...
            </div>
          )}
          {!drawerLoading && drawerProject && (
            <>
              {/* Settings Group */}
              <div>
                <h3 className="drawer-section-title">Project Settings</h3>
                <div className="drawer-grid" style={{ marginTop: '10px' }}>
                  <div className="drawer-field">
                    <div className="df-label">Runtime</div>
                    <div className="df-val">{drawerProject.runtime}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Region</div>
                    <div className="df-val">{drawerProject.region}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Build Command</div>
                    <div className="df-val mono">{drawerProject.buildCmd || 'None'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Start Command</div>
                    <div className="df-val mono">{drawerProject.startCmd || 'None'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Port</div>
                    <div className="df-val mono">{drawerProject.port}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Auto-Deploy</div>
                    <div className="df-val">{drawerProject.autoDeploy ? `✓ On push to ${drawerProject.branch}` : 'Disabled'}</div>
                  </div>
                </div>
              </div>

              {/* Environment Variables Group */}
              <div>
                <h3 className="drawer-section-title">Environment Variables</h3>
                {(() => {
                  const prodEnv = drawerProject.environments?.find((e: any) => e.name === 'PRODUCTION');
                  const vars = prodEnv ? (typeof prodEnv.variables === 'string' ? JSON.parse(prodEnv.variables) : prodEnv.variables) : {};
                  const keys = Object.keys(vars || {});
                  
                  // Default mock variables so it aligns with prototype visual feel if none are defined yet
                  const displayKeys = keys.length > 0 ? keys : ['NODE_ENV', 'DATABASE_URL', 'PAYSTACK_KEY', 'REDIS_URL'];
                  const displayVars = keys.length > 0 ? vars : { 
                    NODE_ENV: 'production',
                    DATABASE_URL: 'postgresql://postgres@localhost:5432/nexgenhost_dev',
                    PAYSTACK_KEY: 'sk_live_xxxx',
                    REDIS_URL: 'redis://localhost:6379'
                  };

                  return (
                    <>
                      {envMsg && (
                        <div className={`notice notice-${envMsg.type}`} style={{ marginBottom: '12px' }}>
                          {envMsg.text}
                        </div>
                      )}

                      {isEditingEnv ? (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {envList.map((item, index) => (
                              <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  placeholder="KEY"
                                  value={item.key}
                                  onChange={(e) => updateEnvField(index, 'key', e.target.value)}
                                  style={{ flex: 1, fontFamily: 'monospace' }}
                                />
                                <input
                                  type="text"
                                  className="form-input"
                                  placeholder="value"
                                  value={item.value}
                                  onChange={(e) => updateEnvField(index, 'value', e.target.value)}
                                  style={{ flex: 2, fontFamily: 'monospace' }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '4px' }}
                                  onClick={() => removeEnvField(index)}
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}
                          </div>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button className="btn btn-ghost" style={{ fontSize: '11px' }} onClick={addEnvField}>
                              + Add Variable
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                            <button
                              className="btn btn-primary"
                              style={{ flex: 1 }}
                              onClick={handleSaveEnv}
                              disabled={saveEnvLoading}
                            >
                              {saveEnvLoading ? 'Saving...' : 'Save Config'}
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ flex: 1 }}
                              onClick={handleCancelEnvEdit}
                              disabled={saveEnvLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <table className="data-table" style={{ marginTop: '8px' }}>
                            <thead>
                              <tr>
                                <th>Key</th>
                                <th>Value</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayKeys.map((k) => (
                                <tr key={k}>
                                  <td className="td-mono">{k}</td>
                                  <td className="td-mono">
                                    {k === 'NODE_ENV' ? displayVars[k] : '••••••••••••••••'}
                                  </td>
                                  <td>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ padding: '2px 8px', fontSize: '10px' }}
                                      onClick={handleEditEnvClick}
                                    >
                                      Edit
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button
                            className="btn btn-ghost"
                            style={{ marginTop: '8px', fontSize: '11px' }}
                            onClick={handleEditEnvClick}
                          >
                            + Add Variable
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Build Steps & Logs Section */}
              {drawerProject.deployments && drawerProject.deployments.length > 0 && (
                <>
                  <div>
                    <h3 className="drawer-section-title">Latest Build Steps</h3>
                    <div className="deploy-steps" style={{ marginTop: '10px' }}>
                      <div className="deploy-step">
                        {getStepIndicator(1, drawerProject.deployments[0].status)}
                        <div className="step-label">Clone repository from GitHub</div>
                      </div>
                      <div className="deploy-step">
                        {getStepIndicator(2, drawerProject.deployments[0].status)}
                        <div className="step-label">Build Docker image ({drawerProject.runtime})</div>
                      </div>
                      <div className="deploy-step">
                        {getStepIndicator(3, drawerProject.deployments[0].status)}
                        <div className="step-label">Push image to container registry</div>
                      </div>
                      <div className="deploy-step">
                        {getStepIndicator(4, drawerProject.deployments[0].status)}
                        <div className="step-label">Start container on worker node</div>
                      </div>
                      <div className="deploy-step">
                        {getStepIndicator(5, drawerProject.deployments[0].status)}
                        <div className="step-label">Health check checkup</div>
                      </div>
                      <div className="deploy-step">
                        {getStepIndicator(6, drawerProject.deployments[0].status)}
                        <div className="step-label">Update DNS & SSL routing</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="drawer-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Build Logs</span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '10px' }}
                        onClick={() => router.push(`/deployments/${drawerProject.deployments[0].id}`)}
                      >
                        ▶ Stream
                      </button>
                    </div>
                    <div className="log-terminal" style={{ maxHeight: '180px', overflowY: 'auto', marginTop: '8px', fontSize: '11px' }}>
                      {(() => {
                        const dep = drawerProject.deployments[0];
                        const lines = dep.logs
                          ? parseRealLogs(dep.logs)
                          : getMockLogs(
                              dep.status,
                              dep.startedAt,
                              drawerProject.runtime
                            );
                        return lines.map((line: any, idx: number) => (
                          <div key={idx} className="log-line" style={{ display: 'flex', gap: '10px' }}>
                            {line.time && (
                              <span style={{ color: 'var(--ink4)', minWidth: '56px', flexShrink: 0 }}>{line.time}</span>
                            )}
                            <span
                              style={{
                                color:
                                  line.kind === 'success' ? 'var(--green)' :
                                  line.kind === 'error'   ? 'var(--red)' :
                                  line.kind === 'info'    ? 'var(--accent)' :
                                  'var(--ink4)',
                              }}
                            >
                              {line.text}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {(() => {
          const basicProject = projects.find(p => p.id === selectedProjectId);
          if (!basicProject) return null;
          return (
            <div className="drawer-footer" style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={deploying}
                onClick={async () => {
                  setDeploying(true);
                  try {
                    const { deployment } = await apiFetch<any>('/deployments', {
                      method: 'POST',
                      body: {
                        projectId: basicProject.id,
                        environment: 'PRODUCTION',
                        commitMsg: 'Manual redeployment',
                      },
                    });
                    setActionSuccessMessage(`Deployment ${deployment.id} triggered!`);
                    setTimeout(() => setActionSuccessMessage(null), 4000);
                    // Refresh drawer details
                    apiFetch<{ project: any }>(`/projects/${basicProject.id}`)
                      .then((data) => setDrawerProject(data.project));
                  } catch (err) {
                    console.error(err);
                    alert(err instanceof Error ? err.message : 'Failed to trigger deployment');
                  } finally {
                    setDeploying(false);
                  }
                }}
              >
                {deploying ? 'Deploying...' : '⚡ Deploy'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => router.push(`/projects/${basicProject.id}`)}
              >
                Settings
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete project "${basicProject.name}"?`)) {
                    try {
                      await apiFetch(`/projects/${basicProject.id}`, { method: 'DELETE' });
                      setSelectedProjectId(null);
                      fetchProjects();
                    } catch (err) {
                      console.error(err);
                      alert('Failed to delete project');
                    }
                  }
                }}
              >
                Delete
              </button>
            </div>
          );
        })()}

        {actionSuccessMessage && (
          <div className="notice notice-success" style={{ margin: '0 24px 12px 24px', fontSize: '11px' }}>
            {actionSuccessMessage}
          </div>
        )}
      </div>
    </>
  );
}
