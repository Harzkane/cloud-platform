'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, getStoredUser } from '@/lib/api';

interface TeamMember {
  name: string;
  email: string;
  role: string;
  avatar: string;
  isYou: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI States
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Preference Toggle States
  const [twoFactor, setTwoFactor] = useState(true);
  const [notifs, setNotifs] = useState({
    success: true,
    failure: true,
    usage: true,
    billing: false,
    security: true,
  });

  // Team Members State
  const [team, setTeam] = useState<TeamMember[]>([
    { name: 'John Doe', email: 'john@example.com', role: 'Owner', avatar: 'JD', isYou: true },
    { name: 'Amaka Okonkwo', email: 'amaka@example.com', role: 'Developer', avatar: 'AO', isYou: false },
    { name: 'Chukwuemeka Bello', email: 'emeka@example.com', role: 'Viewer', avatar: 'CB', isYou: false },
  ]);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      // Align Owner details with stored user
      setTeam((prev) =>
        prev.map((member) =>
          member.isYou
            ? {
                ...member,
                name: stored.name,
                email: stored.email,
                avatar: stored.name.slice(0, 2).toUpperCase(),
              }
            : member
        )
      );
    }
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (newPassword !== confirmPassword) {
      setMsg({ type: 'danger', text: 'New passwords do not match' });
      return;
    }

    setLoading(true);

    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });

      setMsg({ type: 'success', text: 'Password updated successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setMsg(null);
      }, 2000);
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = (email: string) => {
    if (confirm(`Remove team member with email ${email}?`)) {
      setTeam(team.filter((member) => member.email !== email));
    }
  };

  const handleToggleNotif = (key: keyof typeof notifs) => {
    setNotifs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (!user) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_SETTINGS_CONSOLES...
      </div>
    );
  }

  return (
    <>
      <div className="page-fade">
        <div className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Account, team, and platform preferences</p>
          </div>
        </div>

        <div className="grid-2">
          {/* Account Settings Panel */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Account Information</div>
            </div>
            
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Full Name</div>
                <div className="setting-desc">{user.name}</div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => alert('Editing name is disabled for MVP.')}
              >
                Edit
              </button>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Email Address</div>
                <div className="setting-desc">{user.email}</div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => alert('Changing email requires verification.')}
              >
                Change
              </button>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Password</div>
                <div className="setting-desc">Last changed recently</div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => setIsPasswordModalOpen(true)}
              >
                Reset
              </button>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Two-Factor Auth (2FA)</div>
                <div className="setting-desc">Extra security for your account</div>
              </div>
              <div className="toggle-wrap" onClick={() => setTwoFactor(!twoFactor)}>
                <div className={`toggle ${twoFactor ? 'on' : ''}`}></div>
                <span style={{ fontSize: '11px', color: twoFactor ? 'var(--accent)' : 'var(--ink4)' }}>
                  {twoFactor ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          {/* Notifications Panel */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Notifications</div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Deployment Success</div>
                <div className="setting-desc">Email on every successful deploy</div>
              </div>
              <div className="toggle-wrap" onClick={() => handleToggleNotif('success')}>
                <div className={`toggle ${notifs.success ? 'on' : ''}`}></div>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Deployment Failures</div>
                <div className="setting-desc">Immediate alert on deploy failure</div>
              </div>
              <div className="toggle-wrap" onClick={() => handleToggleNotif('failure')}>
                <div className={`toggle ${notifs.failure ? 'on' : ''}`}></div>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Usage Alerts</div>
                <div className="setting-desc">Notify at 80% resource usage</div>
              </div>
              <div className="toggle-wrap" onClick={() => handleToggleNotif('usage')}>
                <div className={`toggle ${notifs.usage ? 'on' : ''}`}></div>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Billing Reminders</div>
                <div className="setting-desc">7 days before renewal</div>
              </div>
              <div className="toggle-wrap" onClick={() => handleToggleNotif('billing')}>
                <div className={`toggle ${notifs.billing ? 'on' : ''}`}></div>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Security Alerts</div>
                <div className="setting-desc">New login & API key usage</div>
              </div>
              <div className="toggle-wrap" onClick={() => handleToggleNotif('security')}>
                <div className={`toggle ${notifs.security ? 'on' : ''}`}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Members Section */}
        <div className="panel" style={{ marginTop: '24px' }}>
          <div className="panel-header">
            <div className="panel-title">Team Members</div>
            <div className="panel-actions">
              <button
                className="btn btn-primary"
                style={{ padding: '5px 12px', fontSize: '11px' }}
                onClick={() => alert('✉️ Invite link copied — send to team member')}
              >
                + Invite Member
              </button>
            </div>
          </div>
          
          {team.map((member) => (
            <div key={member.email} className="member-row">
              <div
                className="member-avatar"
                style={{
                  background:
                    member.role === 'Owner' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' :
                    member.role === 'Developer' ? 'linear-gradient(135deg,#059669,#10b981)' :
                    'linear-gradient(135deg,#d97706,#f59e0b)',
                  color: 'white',
                }}
              >
                {member.avatar}
              </div>
              <div className="member-info">
                <div className="member-name">
                  {member.name}
                  {member.isYou && (
                    <span className="badge badge-success" style={{ marginLeft: '6px' }}>You</span>
                  )}
                </div>
                <div className="member-email">{member.email}</div>
              </div>
              <span className={`badge ${
                member.role === 'Owner' ? 'badge-info' :
                member.role === 'Developer' ? 'badge-staging' : 'badge-muted'
              }`}>
                {member.role}
              </span>
              {!member.isYou && (
                <button
                  className="btn btn-danger"
                  style={{ padding: '3px 10px', fontSize: '11px', marginLeft: '8px' }}
                  onClick={() => handleRemoveMember(member.email)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Danger Zone Section */}
        <div className="panel" style={{ marginTop: '24px', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <div className="panel-header" style={{ background: 'rgba(239, 68, 68, 0.05)' }}>
            <div className="panel-title" style={{ color: 'var(--danger)' }}>⚠️ Danger Zone</div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Delete Account</div>
              <div className="setting-desc">Permanently delete account and all projects. This cannot be undone.</div>
            </div>
            <button
              className="btn btn-danger"
              onClick={() => {
                const conf = prompt('💀 Type DELETE to confirm account deletion');
                if (conf === 'DELETE') {
                  alert('Account deletion triggered.');
                }
              }}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="modal-backdrop open">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Security & Password Update</h2>
              <button className="modal-close" onClick={() => setIsPasswordModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                {msg && (
                  <div className={`notice notice-${msg.type}`} style={{ margin: '0 0 16px' }}>
                    {msg.text}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="curr-pass">Current Password</label>
                  <input
                    id="curr-pass"
                    type="password"
                    className="form-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label" htmlFor="new-pass">New Password</label>
                  <input
                    id="new-pass"
                    type="password"
                    className="form-input"
                    placeholder="Min. 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label" htmlFor="conf-pass">Confirm New Password</label>
                  <input
                    id="conf-pass"
                    type="password"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsPasswordModalOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Updating Password...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
