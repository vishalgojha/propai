"use client";

import React from 'react';
import {
  Loader2,
  Search,
  Building2,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { handleApiError, default as backendApi } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  developer_name: string;
  locality: string;
  city: string;
  status: string;
  configurations: string[];
  possession_date: string | null;
  total_units: number | null;
  is_verified: boolean;
  cover_image_url: string | null;
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  upcoming: { label: 'Upcoming', class: 'text-blue-400 border-blue-400/30 bg-blue-400/5' },
  ongoing: { label: 'Ongoing', class: 'text-amber-400 border-amber-400/30 bg-amber-400/5' },
  'ready-possession': { label: 'Ready Possession', class: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' },
  completed: { label: 'Completed', class: 'text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/5' },
};

const formatPrice = (value: number): string => {
  const cr = value / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`;
  const l = value / 100000;
  return `₹${l.toFixed(0)} L`;
};

export default function ProjectHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const localityFilter = searchParams.get('locality') || '';

  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [searchInput, setSearchInput] = React.useState(query);

  const fetchProjects = React.useCallback(async (q: string, loc: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (loc) params.set('locality', loc);
      params.set('limit', '50');

      const resp = await backendApi.get(`${ENDPOINTS.projects.search}?${params.toString()}`);
      setProjects(resp.data?.data || []);
      setTotal(resp.data?.total || 0);
    } catch (err) {
      console.error(handleApiError(err));
      setProjects([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProjects(query, localityFilter);
  }, [query, localityFilter, fetchProjects]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set('q', searchInput.trim());
    if (localityFilter) params.set('locality', localityFilter);
    setSearchParams(params, { replace: true });
  };

  const handleLocalityClick = (loc: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('locality', loc);
    setSearchParams(params, { replace: true });
    setSearchInput(query);
  };

  const isSuperAdmin = user?.appRole === 'super_admin' || user?.email === 'vishal@chaoscraftlabs.com';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)]">Project Hub</h1>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
            Discover projects, view inventory, and connect with sales teams
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            to="/projects/new"
            className="h-9 px-4 rounded-lg bg-[var(--accent)] text-[11px] font-bold text-[var(--on-propai-green)] flex items-center gap-1.5"
          >
            <Building2 className="h-4 w-4" />
            Add Project
          </Link>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search by project name, developer, or locality..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full h-12 rounded-xl border border-white/5 bg-[var(--bg-surface)] pl-10 pr-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/40 transition-colors"
        />
      </form>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-[var(--text-muted)] mb-3" />
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">No projects found</p>
          <p className="text-[12px] text-[var(--text-secondary)] mt-1">
            {query || localityFilter ? 'Try a different search term or filter.' : 'Projects will appear here once added.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-[var(--text-muted)]">{total} project{total !== 1 ? 's' : ''} found</p>
          {projects.map((project) => {
            const statusInfo = STATUS_LABELS[project.status] || STATUS_LABELS.ongoing;
            return (
              <Link
                key={project.id}
                to={`/projects/${project.slug}`}
                className="block rounded-2xl bg-[var(--bg-surface)] border border-white/3 p-5 hover:border-[var(--accent)]/20 transition-all"
              >
                <div className="flex items-start gap-4">
                  {project.cover_image_url ? (
                    <div className="hidden sm:block w-24 h-20 rounded-xl overflow-hidden shrink-0 bg-[var(--bg-elevated)]">
                      <img src={project.cover_image_url} alt={project.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="hidden sm:flex w-24 h-20 rounded-xl bg-[var(--bg-elevated)] items-center justify-center shrink-0">
                      <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[15px] font-bold text-[var(--text-primary)]">{project.name}</span>
                      {project.is_verified && (
                        <CheckCircle2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)]">{project.developer_name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {project.locality}, {project.city}
                      </span>
                      {project.configurations.length > 0 && (
                        <span>{project.configurations.join(', ')}</span>
                      )}
                      {project.total_units && (
                        <span>{project.total_units} units</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]", statusInfo.class)}>
                        {statusInfo.label}
                      </span>
                      {project.possession_date && (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                          <Calendar className="h-3 w-3" />
                          {new Date(project.possession_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-2" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
