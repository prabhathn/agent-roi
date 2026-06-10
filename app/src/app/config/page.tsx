'use client';

import { useEffect, useState, useCallback } from 'react';
import type { AgentConfig } from '@/types';

type FormData = Omit<AgentConfig, 'id'> & { id?: string };

const emptyForm: FormData = {
  name: '',
  slug: '',
  agent_type: 'cortex_agent',
  mode: 'live_chat',
  sf_database: '',
  sf_schema: '',
  sf_agent_name: '',
  endpoint_url: '',
  endpoint_method: 'POST',
  auth_type: null,
  auth_secret_key: null,
  obs_database: null,
  obs_schema: null,
  obs_agent_name: null,
  description: '',
  routing_description: '',
  is_default: false,
  is_active: true,
};

export default function ConfigPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<FormData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgents(data.agents || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleAdd = () => {
    setEditingAgent({ ...emptyForm });
    setIsNew(true);
  };

  const handleEdit = (agent: AgentConfig) => {
    setEditingAgent({ ...agent });
    setIsNew(false);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Delete this agent? Historical trace data will be preserved.')) return;
    await fetch(`/api/agents/${slug}`, { method: 'DELETE' });
    fetchAgents();
  };

  const handleToggleActive = async (agent: AgentConfig) => {
    await fetch(`/api/agents/${agent.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !agent.is_active }),
    });
    fetchAgents();
  };

  const handleSave = async () => {
    if (!editingAgent) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingAgent),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      } else {
        const res = await fetch(`/api/agents/${editingAgent.slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingAgent),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      setEditingAgent(null);
      fetchAgents();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field: string, value: unknown) => {
    if (!editingAgent) return;
    setEditingAgent({ ...editingAgent, [field]: value });
    // Auto-generate slug from name for new agents
    if (field === 'name' && isNew) {
      const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setEditingAgent({ ...editingAgent, name: String(value), slug });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-[var(--surface-secondary)] rounded" />
          <div className="h-24 bg-[var(--surface-secondary)] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--foreground)]">Agent Configuration</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Register and manage agents for chat, traces, and ROI measurement.</p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-sm font-medium bg-[var(--foreground)] text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + Add Agent
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Agent List */}
      <div className="space-y-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`border rounded-xl p-4 transition-colors ${
              agent.is_active ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-dashed border-[var(--border)] bg-[var(--surface-secondary)] opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-[var(--foreground)]">{agent.name}</h3>
                  {agent.is_default && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Default</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    agent.agent_type === 'cortex_agent'
                      ? 'bg-purple-100 text-purple-700'
                      : agent.agent_type === 'cortex_rest_api'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {agent.agent_type === 'cortex_agent' ? 'Cortex' : agent.agent_type === 'cortex_rest_api' ? 'Cortex REST API' : 'External'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    agent.mode === 'live_chat'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {agent.mode === 'live_chat' ? 'Live Chat' : 'Observability Only'}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1">{agent.description || 'No description'}</p>
                <div className="mt-2 text-xs text-[var(--text-muted)] font-mono">
                  {agent.agent_type === 'cortex_agent' ? (
                    <span>{agent.sf_database}.{agent.sf_schema}.{agent.sf_agent_name}</span>
                  ) : (
                    <span>{agent.endpoint_url || 'No endpoint'}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => handleEdit(agent)}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button
                  onClick={() => handleToggleActive(agent)}
                  className={`p-2 rounded-lg transition-colors ${agent.is_active ? 'text-green-600 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                  title={agent.is_active ? 'Deactivate' : 'Activate'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={agent.is_active ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} /></svg>
                </button>
                <button
                  onClick={() => handleDelete(agent.slug)}
                  className="p-2 text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}

        {agents.length === 0 && (
          <div className="text-center py-12 text-[var(--text-muted)]">
            <p>No agents configured yet.</p>
            <button onClick={handleAdd} className="mt-2 text-sm underline">Add your first agent</button>
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              {isNew ? 'Add Agent' : 'Edit Agent'}
            </h2>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Name</label>
                <input
                  type="text"
                  value={editingAgent.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)] focus:outline-none focus:border-[var(--border-strong)]"
                  placeholder="My Agent"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Slug (URL identifier)</label>
                <input
                  type="text"
                  value={editingAgent.slug}
                  onChange={(e) => updateForm('slug', e.target.value)}
                  disabled={!isNew}
                  className="w-full h-9 px-3 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)] focus:outline-none focus:border-[var(--border-strong)] disabled:opacity-50 font-mono"
                  placeholder="my-agent"
                />
              </div>

              {/* Type & Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Agent Type</label>
                  <select
                    value={editingAgent.agent_type}
                    onChange={(e) => updateForm('agent_type', e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)]"
                  >
                    <option value="cortex_agent">Cortex Agent</option>
                    <option value="cortex_rest_api">Cortex REST API Agent</option>
                    <option value="external_agent">External Agent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Mode</label>
                  <select
                    value={editingAgent.mode}
                    onChange={(e) => updateForm('mode', e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)]"
                  >
                    <option value="live_chat">Live Chat</option>
                    <option value="observability_only">Observability Only</option>
                  </select>
                </div>
              </div>

              {/* Cortex Agent fields */}
              {editingAgent.agent_type === 'cortex_agent' && (
                <fieldset className="border border-[var(--border)] rounded-lg p-3 space-y-3">
                  <legend className="text-xs font-medium text-[var(--text-muted)] px-1">Cortex Agent Configuration</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Database</label>
                      <input
                        type="text"
                        value={editingAgent.sf_database || ''}
                        onChange={(e) => updateForm('sf_database', e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="MY_DB"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Schema</label>
                      <input
                        type="text"
                        value={editingAgent.sf_schema || ''}
                        onChange={(e) => updateForm('sf_schema', e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="PUBLIC"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Agent Name</label>
                      <input
                        type="text"
                        value={editingAgent.sf_agent_name || ''}
                        onChange={(e) => updateForm('sf_agent_name', e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="MY_AGENT"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              {/* Cortex REST API Agent fields */}
              {editingAgent.agent_type === 'cortex_rest_api' && (
                <fieldset className="border border-[var(--border)] rounded-lg p-3 space-y-3">
                  <legend className="text-xs font-medium text-[var(--text-muted)] px-1">Cortex REST API Agent Configuration</legend>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Endpoint URL</label>
                    <input
                      type="text"
                      value={editingAgent.endpoint_url || ''}
                      onChange={(e) => updateForm('endpoint_url', e.target.value)}
                      className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                      placeholder="http://localhost:8000/chat"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Obs Database</label>
                      <input
                        type="text"
                        value={editingAgent.obs_database || ''}
                        onChange={(e) => updateForm('obs_database', e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="AGENT_ROI_DEMO"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Obs Schema</label>
                      <input
                        type="text"
                        value={editingAgent.obs_schema || ''}
                        onChange={(e) => updateForm('obs_schema', e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="APP"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">External Agent Name</label>
                      <input
                        type="text"
                        value={editingAgent.obs_agent_name || ''}
                        onChange={(e) => updateForm('obs_agent_name', e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="KNOWLEDGE_RAG_AGENT"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              {/* External Agent fields */}
              {editingAgent.agent_type === 'external_agent' && (
                <fieldset className="border border-[var(--border)] rounded-lg p-3 space-y-3">
                  <legend className="text-xs font-medium text-[var(--text-muted)] px-1">External Agent Configuration</legend>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Endpoint URL</label>
                    <input
                      type="text"
                      value={editingAgent.endpoint_url || ''}
                      onChange={(e) => updateForm('endpoint_url', e.target.value)}
                      className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                      placeholder="https://my-agent.example.com/chat"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Auth Type</label>
                      <select
                        value={editingAgent.auth_type || 'none'}
                        onChange={(e) => updateForm('auth_type', e.target.value === 'none' ? null : e.target.value)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)]"
                      >
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="api_key">API Key</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Secret Key Reference</label>
                      <input
                        type="text"
                        value={editingAgent.auth_secret_key || ''}
                        onChange={(e) => updateForm('auth_secret_key', e.target.value || null)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="secret_name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Obs Database</label>
                      <input
                        type="text"
                        value={editingAgent.obs_database || ''}
                        onChange={(e) => updateForm('obs_database', e.target.value || null)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="MY_DB"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Obs Schema</label>
                      <input
                        type="text"
                        value={editingAgent.obs_schema || ''}
                        onChange={(e) => updateForm('obs_schema', e.target.value || null)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="PUBLIC"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">Obs Agent Name</label>
                      <input
                        type="text"
                        value={editingAgent.obs_agent_name || ''}
                        onChange={(e) => updateForm('obs_agent_name', e.target.value || null)}
                        className="w-full h-8 px-2 text-xs border border-[var(--border)] rounded bg-[var(--surface-secondary)] font-mono"
                        placeholder="AGENT_NAME"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description</label>
                <textarea
                  value={editingAgent.description || ''}
                  onChange={(e) => updateForm('description', e.target.value)}
                  className="w-full h-16 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)] focus:outline-none focus:border-[var(--border-strong)] resize-none"
                  placeholder="What does this agent do?"
                />
              </div>

              {/* Flags */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={editingAgent.is_default}
                    onChange={(e) => updateForm('is_default', e.target.checked)}
                    className="rounded"
                  />
                  Default agent
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={editingAgent.is_active}
                    onChange={(e) => updateForm('is_active', e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--border)]">
              <button
                onClick={() => setEditingAgent(null)}
                className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editingAgent.name || !editingAgent.slug}
                className="px-4 py-2 text-sm font-medium bg-[var(--foreground)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
