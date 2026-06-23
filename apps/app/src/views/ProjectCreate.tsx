"use client";

import React from 'react';
import { ArrowLeft, Building2, Loader2, Plus, Trash2 } from 'lucide-react';
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

const RESOURCE_TYPES = [
  { value: 'brochure', label: 'Brochure' },
  { value: 'inventory_sheet', label: 'Inventory Sheet' },
  { value: 'cost_sheet', label: 'Cost Sheet' },
  { value: 'floor_plan', label: 'Floor Plan' },
  { value: 'payment_plan', label: 'Payment Plan' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'other', label: 'Other' },
] as const;

const FURNISHING_OPTIONS = ['Unfurnished', 'Semi Furnished', 'Full Furnished'] as const;
const INVENTORY_STATUS = ['available', 'sold', 'blocked'] as const;

const inputClass =
  'w-full h-12 rounded-xl border border-white/5 bg-[var(--bg-elevated)] px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/40 transition-colors';

const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-2';

const sectionClass = 'rounded-2xl bg-[var(--bg-surface)] border border-white/3 p-6 md:p-7 space-y-5';

const sectionTitleClass = 'text-[15px] font-bold text-[var(--text-primary)]';

const cardClass = 'rounded-xl border border-white/5 bg-[var(--bg-elevated)]/40 p-4 space-y-4';

let nextId = 0;
const uid = () => `draft-${++nextId}`;

type ContactDraft = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  whatsapp_phone: string;
  is_primary: boolean;
};

type ResourceDraft = {
  id: string;
  title: string;
  file_type: (typeof RESOURCE_TYPES)[number]['value'];
  file_url: string;
  is_broker_only: boolean;
};

type FloorPlanDraft = {
  id: string;
  bhk: string;
  area: string;
  image: string;
};

type InventoryDraft = {
  id: string;
  bhk: string;
  price_numeric: string;
  carpet_area: string;
  furnishing: (typeof FURNISHING_OPTIONS)[number];
  status: (typeof INVENTORY_STATUS)[number];
};

type BrokerResourceDraft = {
  id: string;
  title: string;
  file_url: string;
};

const emptyContact = (): ContactDraft => ({
  id: uid(),
  name: '',
  role: 'Sales Manager',
  phone: '',
  email: '',
  whatsapp_phone: '',
  is_primary: false,
});

const emptyResource = (fileType: ResourceDraft['file_type'] = 'brochure'): ResourceDraft => ({
  id: uid(),
  title: fileType === 'brochure' ? 'Project Brochure' : '',
  file_type: fileType,
  file_url: '',
  is_broker_only: false,
});

const emptyFloorPlan = (): FloorPlanDraft => ({
  id: uid(),
  bhk: '',
  area: '',
  image: '',
});

const emptyInventory = (): InventoryDraft => ({
  id: uid(),
  bhk: '',
  price_numeric: '',
  carpet_area: '',
  furnishing: 'Unfurnished',
  status: 'available',
});

const emptyBrokerResource = (): BrokerResourceDraft => ({
  id: uid(),
  title: '',
  file_url: '',
});

const splitList = (value: string) =>
  value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

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
    amenities: '',
    gallery: '',
    latitude: '',
    longitude: '',
    total_towers: '1',
    total_floors: '',
    total_units: '',
    cover_image_url: '',
    logo_url: '',
    is_published: false,
    is_verified: false,
  });

  const [contacts, setContacts] = React.useState<ContactDraft[]>([emptyContact()]);
  const [resources, setResources] = React.useState<ResourceDraft[]>([emptyResource()]);
  const [floorPlans, setFloorPlans] = React.useState<FloorPlanDraft[]>([]);
  const [inventory, setInventory] = React.useState<InventoryDraft[]>([]);
  const [brokerResources, setBrokerResources] = React.useState<BrokerResourceDraft[]>([]);

  const updateField = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateListItem = <T extends { id: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
    patch: Partial<T>
  ) => {
    setter((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeListItem = <T extends { id: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
    fallback: () => T
  ) => {
    setter((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length > 0 ? next : [fallback()];
    });
  };

  const setPrimaryContact = (id: string) => {
    setContacts((prev) => prev.map((c) => ({ ...c, is_primary: c.id === id })));
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
        total_towers: parseInt(form.total_towers, 10) || 1,
      };

      if (form.description.trim()) payload.description = form.description.trim();
      if (form.rera_number.trim()) payload.rera_number = form.rera_number.trim();
      if (form.possession_date) payload.possession_date = form.possession_date;
      if (form.cover_image_url.trim()) payload.cover_image_url = form.cover_image_url.trim();
      if (form.logo_url.trim()) payload.logo_url = form.logo_url.trim();
      if (form.latitude.trim()) payload.latitude = parseFloat(form.latitude);
      if (form.longitude.trim()) payload.longitude = parseFloat(form.longitude);
      if (form.total_floors) payload.total_floors = parseInt(form.total_floors, 10);
      if (form.total_units) payload.total_units = parseInt(form.total_units, 10);

      const configs = splitList(form.configurations);
      if (configs.length > 0) payload.configurations = configs;

      const amenities = splitList(form.amenities);
      if (amenities.length > 0) payload.amenities = amenities;

      const gallery = splitList(form.gallery);
      if (gallery.length > 0) payload.gallery = gallery;

      const plans = floorPlans
        .filter((p) => p.bhk.trim() && p.area.trim())
        .map((p) => ({
          bhk: p.bhk.trim(),
          area: parseFloat(p.area),
          ...(p.image.trim() ? { image: p.image.trim() } : {}),
        }))
        .filter((p) => !Number.isNaN(p.area));
      if (plans.length > 0) payload.floor_plans = plans;

      const resp = await backendApi.post(ENDPOINTS.projects.create, payload);
      const project = resp.data?.project;
      if (!project?.id || !project?.slug) throw new Error('Project created but no ID returned');

      const projectId = project.id as string;

      if (form.is_published || form.is_verified) {
        await backendApi.put(ENDPOINTS.projects.update(projectId), {
          is_published: form.is_published,
          is_verified: form.is_verified,
        });
      }

      const contactPayloads = contacts
        .filter((c) => c.name.trim() && c.role.trim())
        .map((c, index) => ({
          name: c.name.trim(),
          role: c.role.trim(),
          phone: c.phone.trim() || undefined,
          email: c.email.trim() || undefined,
          whatsapp_phone: c.whatsapp_phone.trim() || undefined,
          is_primary: c.is_primary,
          sort_order: index,
        }));

      const resourcePayloads = resources
        .filter((r) => r.title.trim() && r.file_url.trim())
        .map((r) => ({
          title: r.title.trim(),
          file_type: r.file_type,
          file_url: r.file_url.trim(),
          is_broker_only: r.is_broker_only,
        }));

      const inventoryPayloads = inventory
        .filter((item) => item.bhk.trim() && item.price_numeric.trim())
        .map((item) => ({
          bhk: item.bhk.trim(),
          price_numeric: parseFloat(item.price_numeric),
          carpet_area: item.carpet_area ? parseFloat(item.carpet_area) : undefined,
          furnishing: item.furnishing,
          status: item.status,
        }))
        .filter((item) => !Number.isNaN(item.price_numeric));

      const brokerPayloads = brokerResources
        .filter((r) => r.title.trim() && r.file_url.trim())
        .map((r) => ({
          title: r.title.trim(),
          file_url: r.file_url.trim(),
        }));

      await Promise.all([
        ...contactPayloads.map((c) => backendApi.post(ENDPOINTS.projects.contacts(projectId), c)),
        ...resourcePayloads.map((r) => backendApi.post(ENDPOINTS.projects.resources(projectId), r)),
        ...brokerPayloads.map((r) => backendApi.post(ENDPOINTS.projects.brokerResources(projectId), r)),
        inventoryPayloads.length > 0
          ? backendApi.post(ENDPOINTS.projects.inventory(projectId), inventoryPayloads)
          : Promise.resolve(),
      ]);

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
    <div className="w-full pb-16">
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
          Create a developer project with contacts, brochures, inventory, and media
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>Basic Info</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Project Name *</label>
                <input type="text" required value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g. Lodha Park" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Developer *</label>
                <input type="text" required value={form.developer_name} onChange={(e) => updateField('developer_name', e.target.value)} placeholder="e.g. Lodha Group" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>Locality *</label>
                <input type="text" required value={form.locality} onChange={(e) => updateField('locality', e.target.value)} placeholder="e.g. Worli" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input type="text" value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="Mumbai" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={cn(inputClass, 'appearance-none cursor-pointer')}>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Brief project overview..." rows={4} className={cn(inputClass, 'h-auto py-3 resize-y min-h-[100px]')} />
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>Project Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>RERA Number</label>
                <input type="text" value={form.rera_number} onChange={(e) => updateField('rera_number', e.target.value)} placeholder="P51800000000" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Possession Date</label>
                <input type="date" value={form.possession_date} onChange={(e) => updateField('possession_date', e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Configurations</label>
              <input type="text" value={form.configurations} onChange={(e) => updateField('configurations', e.target.value)} placeholder="2 BHK, 3 BHK, 4 BHK" className={inputClass} />
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Comma-separated</p>
            </div>

            <div className="grid grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>Towers</label>
                <input type="number" min="1" value={form.total_towers} onChange={(e) => updateField('total_towers', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Floors</label>
                <input type="number" min="1" value={form.total_floors} onChange={(e) => updateField('total_floors', e.target.value)} placeholder="—" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Units</label>
                <input type="number" min="1" value={form.total_units} onChange={(e) => updateField('total_units', e.target.value)} placeholder="—" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Latitude</label>
                <input type="number" step="any" value={form.latitude} onChange={(e) => updateField('latitude', e.target.value)} placeholder="19.0176" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Longitude</label>
                <input type="number" step="any" value={form.longitude} onChange={(e) => updateField('longitude', e.target.value)} placeholder="72.8562" className={inputClass} />
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>Media & Gallery</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Cover Image URL</label>
                <input type="url" value={form.cover_image_url} onChange={(e) => updateField('cover_image_url', e.target.value)} placeholder="https://..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Logo URL</label>
                <input type="url" value={form.logo_url} onChange={(e) => updateField('logo_url', e.target.value)} placeholder="https://..." className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Gallery Images</label>
                <textarea
                  value={form.gallery}
                  onChange={(e) => updateField('gallery', e.target.value)}
                  placeholder="One image URL per line"
                  rows={4}
                  className={cn(inputClass, 'h-auto py-3 resize-y min-h-[100px]')}
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">One URL per line</p>
              </div>
              <div>
                <label className={labelClass}>Amenities</label>
                <textarea
                  value={form.amenities}
                  onChange={(e) => updateField('amenities', e.target.value)}
                  placeholder="Swimming Pool, Gym, Clubhouse, Power Backup"
                  rows={4}
                  className={cn(inputClass, 'h-auto py-3 resize-y min-h-[100px]')}
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Comma-separated</p>
              </div>
            </div>
          </section>
        </div>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-4">
            <h2 className={sectionTitleClass}>Floor Plans</h2>
            <button type="button" onClick={() => setFloorPlans((prev) => [...prev, emptyFloorPlan()])} className="h-9 px-3 rounded-lg border border-white/5 text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
              <Plus className="h-3.5 w-3.5" /> Add Plan
            </button>
          </div>

          {floorPlans.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">No floor plans added yet.</p>
          ) : (
            <div className="space-y-4">
              {floorPlans.map((plan) => (
                <div key={plan.id} className={cardClass}>
                  <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-4">
                    <div>
                      <label className={labelClass}>BHK</label>
                      <input type="text" value={plan.bhk} onChange={(e) => updateListItem(setFloorPlans, plan.id, { bhk: e.target.value })} placeholder="3 BHK" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Area (sqft)</label>
                      <input type="number" min="1" value={plan.area} onChange={(e) => updateListItem(setFloorPlans, plan.id, { area: e.target.value })} placeholder="1200" className={inputClass} />
                    </div>
                    <div className="md:col-span-2 xl:col-span-4">
                      <label className={labelClass}>Plan Image URL</label>
                      <input type="url" value={plan.image} onChange={(e) => updateListItem(setFloorPlans, plan.id, { image: e.target.value })} placeholder="https://..." className={inputClass} />
                    </div>
                  </div>
                  <button type="button" onClick={() => setFloorPlans((prev) => prev.filter((p) => p.id !== plan.id))} className="text-[11px] font-bold text-red-400 flex items-center gap-1 hover:underline">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className={sectionTitleClass}>Resources & Brochures</h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">Brochures, cost sheets, payment plans, and other downloadable files</p>
            </div>
            <button type="button" onClick={() => setResources((prev) => [...prev, emptyResource()])} className="h-9 px-3 rounded-lg border border-white/5 text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
              <Plus className="h-3.5 w-3.5" /> Add Resource
            </button>
          </div>

          <div className="space-y-4">
            {resources.map((resource) => (
              <div key={resource.id} className={cardClass}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Title</label>
                    <input type="text" value={resource.title} onChange={(e) => updateListItem(setResources, resource.id, { title: e.target.value })} placeholder="Project Brochure" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <select value={resource.file_type} onChange={(e) => updateListItem(setResources, resource.id, { file_type: e.target.value as ResourceDraft['file_type'] })} className={cn(inputClass, 'appearance-none cursor-pointer')}>
                      {RESOURCE_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="xl:col-span-2">
                    <label className={labelClass}>File URL</label>
                    <input type="url" value={resource.file_url} onChange={(e) => updateListItem(setResources, resource.id, { file_url: e.target.value })} placeholder="https://..." className={inputClass} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] cursor-pointer">
                    <input type="checkbox" checked={resource.is_broker_only} onChange={(e) => updateListItem(setResources, resource.id, { is_broker_only: e.target.checked })} className="rounded border-white/10" />
                    Broker-only resource
                  </label>
                  <button type="button" onClick={() => removeListItem(setResources, resource.id, emptyResource)} className="text-[11px] font-bold text-red-400 flex items-center gap-1 hover:underline">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className={sectionTitleClass}>Sales Contacts</h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">Developer sales team members brokers can reach out to</p>
            </div>
            <button type="button" onClick={() => setContacts((prev) => [...prev, emptyContact()])} className="h-9 px-3 rounded-lg border border-white/5 text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
              <Plus className="h-3.5 w-3.5" /> Add Contact
            </button>
          </div>

          <div className="space-y-4">
            {contacts.map((contact) => (
              <div key={contact.id} className={cardClass}>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input type="text" value={contact.name} onChange={(e) => updateListItem(setContacts, contact.id, { name: e.target.value })} placeholder="Rajesh Kumar" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Role</label>
                    <input type="text" value={contact.role} onChange={(e) => updateListItem(setContacts, contact.id, { role: e.target.value })} placeholder="Sales Manager" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input type="tel" value={contact.phone} onChange={(e) => updateListItem(setContacts, contact.id, { phone: e.target.value })} placeholder="+91 98765 43210" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>WhatsApp</label>
                    <input type="tel" value={contact.whatsapp_phone} onChange={(e) => updateListItem(setContacts, contact.id, { whatsapp_phone: e.target.value })} placeholder="+91 98765 43210" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input type="email" value={contact.email} onChange={(e) => updateListItem(setContacts, contact.id, { email: e.target.value })} placeholder="sales@developer.com" className={inputClass} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] cursor-pointer">
                    <input type="radio" name="primary_contact" checked={contact.is_primary} onChange={() => setPrimaryContact(contact.id)} className="border-white/10" />
                    Primary contact
                  </label>
                  <button type="button" onClick={() => removeListItem(setContacts, contact.id, emptyContact)} className="text-[11px] font-bold text-red-400 flex items-center gap-1 hover:underline">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className={sectionTitleClass}>Inventory</h2>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">Optional units to list at launch</p>
              </div>
              <button type="button" onClick={() => setInventory((prev) => [...prev, emptyInventory()])} className="h-9 px-3 rounded-lg border border-white/5 text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
                <Plus className="h-3.5 w-3.5" /> Add Unit
              </button>
            </div>

            {inventory.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)]">No inventory units added yet.</p>
            ) : (
              <div className="space-y-4">
                {inventory.map((item) => (
                  <div key={item.id} className={cardClass}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                      <div>
                        <label className={labelClass}>BHK</label>
                        <input type="text" value={item.bhk} onChange={(e) => updateListItem(setInventory, item.id, { bhk: e.target.value })} placeholder="3 BHK" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Price (₹)</label>
                        <input type="number" min="1" value={item.price_numeric} onChange={(e) => updateListItem(setInventory, item.id, { price_numeric: e.target.value })} placeholder="35000000" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Carpet Area (sqft)</label>
                        <input type="number" min="1" value={item.carpet_area} onChange={(e) => updateListItem(setInventory, item.id, { carpet_area: e.target.value })} placeholder="1200" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Furnishing</label>
                        <select value={item.furnishing} onChange={(e) => updateListItem(setInventory, item.id, { furnishing: e.target.value as InventoryDraft['furnishing'] })} className={cn(inputClass, 'appearance-none cursor-pointer')}>
                          {FURNISHING_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Status</label>
                        <select value={item.status} onChange={(e) => updateListItem(setInventory, item.id, { status: e.target.value as InventoryDraft['status'] })} className={cn(inputClass, 'appearance-none cursor-pointer')}>
                          {INVENTORY_STATUS.map((opt) => (
                            <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button type="button" onClick={() => setInventory((prev) => prev.filter((i) => i.id !== item.id))} className="text-[11px] font-bold text-red-400 flex items-center gap-1 hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className={sectionTitleClass}>Broker Resources</h2>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">Broker-only files like incentive sheets</p>
              </div>
              <button type="button" onClick={() => setBrokerResources((prev) => [...prev, emptyBrokerResource()])} className="h-9 px-3 rounded-lg border border-white/5 text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
                <Plus className="h-3.5 w-3.5" /> Add File
              </button>
            </div>

            {brokerResources.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)]">No broker resources added yet.</p>
            ) : (
              <div className="space-y-4">
                {brokerResources.map((resource) => (
                  <div key={resource.id} className={cardClass}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Title</label>
                        <input type="text" value={resource.title} onChange={(e) => updateListItem(setBrokerResources, resource.id, { title: e.target.value })} placeholder="Broker Incentive Sheet" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>File URL</label>
                        <input type="url" value={resource.file_url} onChange={(e) => updateListItem(setBrokerResources, resource.id, { file_url: e.target.value })} placeholder="https://..." className={inputClass} />
                      </div>
                    </div>
                    <button type="button" onClick={() => setBrokerResources((prev) => prev.filter((r) => r.id !== resource.id))} className="text-[11px] font-bold text-red-400 flex items-center gap-1 hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className={cn(sectionClass, 'flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between')}>
          <div>
            <h2 className={sectionTitleClass}>Publishing</h2>
            <div className="flex flex-wrap gap-6 mt-3">
              <label className="flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] cursor-pointer">
                <input type="checkbox" checked={form.is_published} onChange={(e) => updateField('is_published', e.target.checked)} className="rounded border-white/10 h-4 w-4" />
                Publish to Project Hub
              </label>
              <label className="flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] cursor-pointer">
                <input type="checkbox" checked={form.is_verified} onChange={(e) => updateField('is_verified', e.target.checked)} className="rounded border-white/10 h-4 w-4" />
                Mark as verified
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button type="submit" disabled={submitting} className="h-12 px-8 rounded-xl bg-[var(--accent)] text-[13px] font-bold text-[var(--on-propai-green)] flex items-center gap-2 disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              Create Project
            </button>
            <Link to="/projects" className="h-12 px-5 rounded-xl border border-white/5 text-[13px] font-bold text-[var(--text-secondary)] flex items-center">
              Cancel
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/5 px-5 py-4 text-[13px] text-red-400">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
