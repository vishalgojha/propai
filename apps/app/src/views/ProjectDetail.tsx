"use client";

import React from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Image,
  Loader2,
  MapPin,
  Phone,
  Smartphone,
  Mail,
  MessageCircle,
  User,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { handleApiError, default as backendApi } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

interface ProjectDetail {
  id: string;
  slug: string;
  name: string;
  developer_name: string;
  description: string | null;
  locality: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  possession_date: string | null;
  rera_number: string | null;
  configurations: string[];
  total_towers: number;
  total_floors: number | null;
  total_units: number | null;
  amenities: string[];
  gallery: string[];
  floor_plans: any[];
  logo_url: string | null;
  cover_image_url: string | null;
  is_verified: boolean;
  is_published: boolean;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  inventory: any[];
  contacts: any[];
  resources: any[];
  updates: any[];
  broker_resources: any[];
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  upcoming: { label: 'Upcoming', class: 'text-blue-400 border-blue-400/30 bg-blue-400/5' },
  ongoing: { label: 'Ongoing', class: 'text-amber-400 border-amber-400/30 bg-amber-400/5' },
  'ready-possession': { label: 'Ready Possession', class: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' },
  completed: { label: 'Completed', class: 'text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/5' },
};

const RESOURCE_ICONS: Record<string, any> = {
  brochure: FileText,
  inventory_sheet: FileText,
  cost_sheet: FileText,
  floor_plan: Image,
  payment_plan: FileText,
  presentation: FileText,
};

const RESOURCE_LABELS: Record<string, string> = {
  brochure: 'Brochure PDF',
  inventory_sheet: 'Inventory Sheet',
  cost_sheet: 'Cost Sheet',
  floor_plan: 'Floor Plans',
  payment_plan: 'Payment Plan',
  presentation: 'Deck',
};

const formatPrice = (value: number): string => {
  const cr = value / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`;
  const l = value / 100000;
  return `₹${l.toFixed(0)} L`;
};

export default function ProjectDetail() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ slug: string }>();
  const slug = params.slug || '';

  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showAllAmenities, setShowAllAmenities] = React.useState(false);

  const isOwner = user && project && (user.id === project.tenant_id || user.appRole === 'super_admin');

  React.useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    backendApi.get(ENDPOINTS.projects.detail(slug))
      .then((resp) => {
        setProject(resp.data?.project || null);
        if (!resp.data?.project) setError('Project not found');
      })
      .catch((err) => {
        const msg = handleApiError(err);
        setError(msg);
        setProject(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <Building2 className="mx-auto h-12 w-12 text-[var(--text-muted)] mb-4" />
        <p className="text-[16px] font-semibold text-[var(--text-primary)]">{error || 'Project not found'}</p>
        <Link to="/projects" className="mt-4 inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to projects
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[project.status] || STATUS_LABELS.ongoing;
  const groupedInventory = project.inventory.reduce((acc: Record<string, any[]>, item: any) => {
    if (!acc[item.bhk]) acc[item.bhk] = [];
    acc[item.bhk].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const primaryContact = project.contacts.find((c: any) => c.is_primary);
  const otherContacts = project.contacts.filter((c: any) => !c.is_primary);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      {/* Back */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Project Hub
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        {/* Main column */}
        <div className="space-y-8">
          {/* Hero */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]', statusInfo.class)}>
                {statusInfo.label}
              </span>
              {project.is_verified && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                </span>
              )}
            </div>
            <h1 className="text-[28px] font-black text-[var(--text-primary)]">{project.name}</h1>
            <p className="text-[14px] text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> {project.developer_name}
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
              <MapPin className="h-4 w-4" /> {project.locality}, {project.city}
            </p>
          </div>

          {/* Description */}
          {project.description && (
            <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-5">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{project.description}</p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Configurations', value: project.configurations.join(', ') },
              { label: 'Towers', value: `${project.total_towers}` },
              { label: 'Floors', value: project.total_floors ? `${project.total_floors}` : '—' },
              { label: 'Total Units', value: project.total_units ? `${project.total_units}` : '—' },
              { label: 'Possession', value: project.possession_date ? new Date(project.possession_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' }) : '—' },
              { label: 'RERA', value: project.rera_number || '—' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-[var(--bg-surface)]/50 border border-white/3 p-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{stat.label}</div>
                <div className="text-[12px] font-semibold text-[var(--text-primary)] mt-1">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Inventory */}
          {project.inventory.length > 0 && (
            <section>
              <h2 className="text-[17px] font-bold text-[var(--text-primary)] mb-4">Available Inventory</h2>
              <div className="space-y-2">
                {Object.entries(groupedInventory as Record<string, any[]>).sort().map(([bhk, items]) => (
                  <div key={bhk} className="rounded-xl bg-[var(--bg-surface)]/50 border border-white/3 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-bold text-[var(--accent)]">{bhk}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{items.length} unit{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      {items.slice(0, 3).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-[12px]">
                          <span className="text-[var(--text-primary)] font-medium">{formatPrice(item.price_numeric)}</span>
                          <span className="text-[var(--text-secondary)]">
                            {item.carpet_area ? `${item.carpet_area} sqft` : ''}
                            {item.furnishing && item.furnishing !== 'Unfurnished' ? ` · ${item.furnishing}` : ''}
                          </span>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <p className="text-[11px] text-[var(--accent)]">+{items.length - 3} more</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Amenities */}
          {project.amenities.length > 0 && (
            <section>
              <h2 className="text-[17px] font-bold text-[var(--text-primary)] mb-4">Amenities</h2>
              <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(showAllAmenities ? project.amenities : project.amenities.slice(0, 9)).map((amenity: string) => (
                    <div key={amenity} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                      <span className="text-[12px] text-[var(--text-primary)]">{amenity}</span>
                    </div>
                  ))}
                </div>
                {project.amenities.length > 9 && (
                  <button
                    onClick={() => setShowAllAmenities(!showAllAmenities)}
                    className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
                  >
                    {showAllAmenities ? 'Show less' : `Show all ${project.amenities.length} amenities`}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAllAmenities && 'rotate-180')} />
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Floor Plans */}
          {project.floor_plans.length > 0 && (
            <section>
              <h2 className="text-[17px] font-bold text-[var(--text-primary)] mb-4">Floor Plans</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {project.floor_plans.map((plan: any) => (
                  <div key={plan.bhk} className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-5 text-center">
                    <div className="text-[18px] font-bold text-[var(--text-primary)]">{plan.bhk}</div>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-1">{plan.area} sqft</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Project Updates */}
          {project.updates.length > 0 && (
            <section>
              <h2 className="text-[17px] font-bold text-[var(--text-primary)] mb-4">Updates</h2>
              <div className="space-y-3">
                {project.updates.map((update: any) => (
                  <div key={update.id} className="rounded-xl bg-[var(--bg-surface)]/50 border border-white/3 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold text-[var(--text-primary)]">{update.title}</span>
                      <span className="text-[9px] text-[var(--text-muted)]">
                        {new Date(update.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    {update.description && (
                      <p className="text-[12px] text-[var(--text-secondary)]">{update.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Primary Contact — the most important section */}
          {project.contacts.length > 0 && (
            <div className="rounded-2xl bg-[var(--bg-surface)] border border-white/3 overflow-hidden">
              <div className="p-4 border-b border-white/3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">Sales Contact</h3>
              </div>
              <div className="divide-y divide-white/3">
                {(primaryContact ? [primaryContact, ...otherContacts] : otherContacts).map((contact: any) => (
                  <div key={contact.id} className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10">
                        <User className="h-5 w-5 text-[var(--accent)]" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-[var(--text-primary)]">{contact.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.08em]">{contact.role}</p>
                      </div>
                    </div>
                    <div className="space-y-2 mt-3">
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="flex items-center gap-2.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {contact.phone}
                        </a>
                      )}
                      {contact.whatsapp_phone && (
                        <a
                          href={`https://wa.me/${contact.whatsapp_phone.replace(/\D/g, '')}?text=Hi%2C%20I%27m%20a%20broker%20interested%20in%20${encodeURIComponent(project.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 text-[12px] text-[var(--accent)] hover:underline"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      )}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center gap-2.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {contact.email}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {project.resources.length > 0 && (
            <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-4">Resources</h3>
              <div className="space-y-2">
                {project.resources.map((resource: any) => {
                  const Icon = RESOURCE_ICONS[resource.file_type] || FileText;
                  return (
                    <a
                      key={resource.id}
                      href={resource.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/5">
                        <Icon className="h-4 w-4 text-[var(--accent)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                          {RESOURCE_LABELS[resource.file_type] || resource.title}
                        </p>
                        {resource.file_size && (
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {(resource.file_size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        )}
                      </div>
                      <Download className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Broker Resources */}
          {project.broker_resources.length > 0 && (
            <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-[var(--accent)]/20 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)] mb-4">Broker Resources</h3>
              <div className="space-y-2">
                {project.broker_resources.map((resource: any) => (
                  <a
                    key={resource.id}
                    href={resource.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-[var(--accent)] shrink-0" />
                    <span className="text-[12px] font-semibold text-[var(--text-primary)] flex-1 truncate">{resource.title}</span>
                    <Download className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Project Info */}
          <div className="rounded-2xl bg-[var(--bg-surface)]/50 border border-white/3 p-4 text-[11px] text-[var(--text-secondary)]">
            {project.rera_number && (
              <p className="mb-1">RERA: {project.rera_number}</p>
            )}
            <p>Last updated: {new Date(project.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Mobile sticky contact bar */}
      {primaryContact && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-base)]/95 backdrop-blur-xl border-t border-white/5 p-3 flex gap-2">
          {primaryContact.phone && (
            <a
              href={`tel:${primaryContact.phone}`}
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-[var(--bg-surface)] text-[11px] font-bold text-[var(--text-primary)]"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
          {primaryContact.whatsapp_phone && (
            <a
              href={`https://wa.me/${primaryContact.whatsapp_phone.replace(/\D/g, '')}?text=Hi%2C%20I%27m%20a%20broker%20interested%20in%20${encodeURIComponent(project.name)}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[11px] font-bold text-[var(--on-propai-green)]"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
