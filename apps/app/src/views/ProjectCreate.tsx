"use client";

import React from 'react';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { handleApiError, default as backendApi } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'ready-possession', label: 'Ready Possession' },
  { value: 'completed', label: 'Completed' },
] as const;

const inputClass =
  'w-full h-12 rounded-xl border border-white/5 bg-[var(--bg-elevated)] px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/40 transition-colors';

const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-2';

const sectionClass = 'rounded-2xl bg-[var(--bg-surface)] border border-white/3 p-6 md:p-7 space-y-5';

export default function ProjectCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isSuperAdmin = user?.appRole === 'super_admin' || user?.email === 'vishal@chaoscraftlabs.com';

  const [form, setForm] = React.useState({
    name: '',
    developer_name: '',
    locality: '',
    city: 'Mumbai',
    status: 'upcoming' as (typeof STATUS_OPTIONS)[number]['value'],
    description: '',
    rera_number: '',
    possession_date: '',
    configurations: '',
    total_towers: '1',
    total_floors: '',
    total_units: '',
    cover_image_url: '',
    logo_url: '',
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        developer_name: form.developer_name.trim(),
        locality: form.locality.trim(),
        city: form.city.trim() || 'Mumbai',
        status: form.status,
      };

      if (form.description.trim()) payload.description = form.description.trim();
      if (form.rera_number.trim()) payload.rera_number = form.rera_number.trim();
      if (form.possession_date) payload.possession_date = form.possession_date;
      if (form.cover_image_url.trim()) payload.cover_image_url = form.cover_image_url.trim();
      if (form.logo_url.trim()) payload.logo_url = form.logo_url.trim();

      const configs = form.configurations
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (configs.length > 0) payload.configurations = configs;

      payload.total_towers = parseInt(form.total_towers, 10) || 1;
      if (form.total_floors) payload.total_floors = parseInt(form.total_floors, 10);
      if (form.total_units) payload.total_units = parseInt(form.total_units, 10);

      const resp = await backendApi.post(ENDPOINTS.projects.create, payload);
      const project = resp.data?.project;
      if (!project?.slug) throw new Error('Project created but no slug returned');

      navigate(`/projects/${project.slug}`);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <Building2 className="mx-auto h-12 w-12 text-[var(--text-muted)] mb-4" />
        <p className="text-[16px] font-semibold text-[var(--text-primary)]">Access denied</p>
        <p className="text-[12px] text-[var(--text-secondary)] mt-1">Only super admins can add projects.</p>
        <Link to="/projects" className="mt-4 inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Project Hub
      </Link>

      <div className="mb-8">
        <h1 className="text-[24px] font-bold text-[var(--text-primary)]">Add Project</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          Create a new developer project for the hub
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className={sectionClass}>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Basic Info</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Project Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g. Lodha Park"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Developer *</label>
                <input
                  type="text"
                  required
                  value={form.developer_name}
                  onChange={(e) => updateField('developer_name', e.target.value)}
                  placeholder="e.g. Lodha Group"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>Locality *</label>
                <input
                  type="text"
                  required
                  value={form.locality}
                  onChange={(e) => updateField('locality', e.target.value)}
                  placeholder="e.g. Worli"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="Mumbai"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className={cn(inputClass, 'appearance-none cursor-pointer')}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Brief project overview..."
                rows={5}
                className={cn(inputClass, 'h-auto py-3 resize-y min-h-[120px]')}
              />
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Details & Media</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>RERA Number</label>
                <input
                  type="text"
                  value={form.rera_number}
                  onChange={(e) => updateField('rera_number', e.target.value)}
                  placeholder="P51800000000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Possession Date</label>
                <input
                  type="date"
                  value={form.possession_date}
                  onChange={(e) => updateField('possession_date', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Configurations</label>
              <input
                type="text"
                value={form.configurations}
                onChange={(e) => updateField('configurations', e.target.value)}
                placeholder="2 BHK, 3 BHK, 4 BHK"
                className={inputClass}
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Comma-separated</p>
            </div>

            <div className="grid grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>Towers</label>
                <input
                  type="number"
                  min="1"
                  value={form.total_towers}
                  onChange={(e) => updateField('total_towers', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Floors</label>
                <input
                  type="number"
                  min="1"
                  value={form.total_floors}
                  onChange={(e) => updateField('total_floors', e.target.value)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Units</label>
                <input
                  type="number"
                  min="1"
                  value={form.total_units}
                  onChange={(e) => updateField('total_units', e.target.value)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
              <div>
                <label className={labelClass}>Cover Image URL</label>
                <input
                  type="url"
                  value={form.cover_image_url}
                  onChange={(e) => updateField('cover_image_url', e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Logo URL</label>
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={(e) => updateField('logo_url', e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/5 px-5 py-4 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="h-12 px-8 rounded-xl bg-[var(--accent)] text-[13px] font-bold text-[var(--on-propai-green)] flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Create Project
          </button>
          <Link
            to="/projects"
            className="h-12 px-5 rounded-xl border border-white/5 text-[13px] font-bold text-[var(--text-secondary)] flex items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
