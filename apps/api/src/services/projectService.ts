import { supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin;

export type ProjectRecord = {
  id: string;
  tenant_id: string;
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
  created_at: string;
  updated_at: string;
};

type CreateProjectInput = {
  tenantId: string;
  slug: string;
  name: string;
  developer_name: string;
  description?: string;
  locality: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  possession_date?: string;
  rera_number?: string;
  configurations?: string[];
  total_towers?: number;
  total_floors?: number;
  total_units?: number;
  amenities?: string[];
  gallery?: string[];
  floor_plans?: any[];
  logo_url?: string;
  cover_image_url?: string;
};

function toSlug(name: string, developer: string): string {
  const base = `${developer} ${name}`.toLowerCase()
    .split('').map(c => /[a-z0-9]/.test(c) ? c : ' ').join('')
    .split(' ').filter(Boolean).join('-');
  return base.replace(/^-+|-+$/g, '').substring(0, 120);
}

export class ProjectService {
  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    if (!db) throw new Error('Database client not configured');
    const slug = input.slug || toSlug(input.name, input.developer_name);

    const { data, error } = await db
      .from('developer_projects')
      .insert({
        tenant_id: input.tenantId,
        slug,
        name: input.name,
        developer_name: input.developer_name,
        description: input.description || null,
        locality: input.locality,
        city: input.city || 'Mumbai',
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        status: input.status || 'upcoming',
        possession_date: input.possession_date || null,
        rera_number: input.rera_number || null,
        configurations: input.configurations || [],
        total_towers: input.total_towers || 1,
        total_floors: input.total_floors || null,
        total_units: input.total_units || null,
        amenities: input.amenities || [],
        gallery: input.gallery || [],
        floor_plans: input.floor_plans || [],
        logo_url: input.logo_url || null,
        cover_image_url: input.cover_image_url || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);
    return data;
  }

  async update(id: string, input: Partial<CreateProjectInput & { is_verified?: boolean; is_published?: boolean }>): Promise<ProjectRecord> {
    if (!db) throw new Error('Database client not configured');
    const updateData: Record<string, any> = {};

    const fields: (keyof typeof input)[] = [
      'name', 'developer_name', 'description', 'locality', 'city',
      'latitude', 'longitude', 'status', 'possession_date', 'rera_number',
      'configurations', 'total_towers', 'total_floors', 'total_units',
      'amenities', 'gallery', 'floor_plans', 'logo_url', 'cover_image_url',
      'is_verified', 'is_published',
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        updateData[field] = input[field];
      }
    }

    const { data, error } = await db
      .from('developer_projects')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update project: ${error.message}`);
    return data;
  }

  async findBySlug(slug: string): Promise<ProjectRecord | null> {
    if (!db) return null;
    const { data, error } = await db
      .from('developer_projects')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) return null;
    return data;
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    if (!db) return null;
    const { data, error } = await db
      .from('developer_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async search(params: {
    q?: string;
    locality?: string;
    city?: string;
    developer?: string;
    configuration?: string;
    status?: string;
    tenant_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ProjectRecord[]; total: number }> {
    if (!db) return { data: [], total: 0 };

    let query = db
      .from('developer_projects')
      .select('*', { count: 'exact' });

    if (params.tenant_id) {
      query = query.eq('tenant_id', params.tenant_id);
    } else {
      query = query.eq('is_published', true);
    }

    if (params.q) {
      query = query.or(
        `name.ilike.%${params.q}%,developer_name.ilike.%${params.q}%,locality.ilike.%${params.q}%`
      );
    }
    if (params.locality) query = query.ilike('locality', `%${params.locality}%`);
    if (params.city) query = query.ilike('city', `%${params.city}%`);
    if (params.developer) query = query.ilike('developer_name', `%${params.developer}%`);
    if (params.configuration) query = query.contains('configurations', [params.configuration]);
    if (params.status) query = query.eq('status', params.status);

    const limit = params.limit || 20;
    const offset = params.offset || 0;

    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Search failed: ${error.message}`);
    return { data: data || [], total: count || 0 };
  }

  async getInventory(projectId: string): Promise<any[]> {
    if (!db) return [];
    const { data, error } = await db
      .from('project_inventory')
      .select('*')
      .eq('project_id', projectId)
      .order('price_numeric', { ascending: true });

    if (error) throw new Error(`Failed to fetch inventory: ${error.message}`);
    return data || [];
  }

  async addInventory(projectId: string, items: any[]): Promise<any[]> {
    if (!db) throw new Error('Database client not configured');
    const records = items.map(item => ({ project_id: projectId, ...item }));
    const { data, error } = await db
      .from('project_inventory')
      .insert(records)
      .select();

    if (error) throw new Error(`Failed to add inventory: ${error.message}`);
    return data || [];
  }

  async updateInventory(id: string, input: any): Promise<any> {
    if (!db) throw new Error('Database client not configured');
    const { data, error } = await db
      .from('project_inventory')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update inventory: ${error.message}`);
    return data;
  }

  async deleteInventory(id: string): Promise<void> {
    if (!db) throw new Error('Database client not configured');
    const { error } = await db
      .from('project_inventory')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete inventory: ${error.message}`);
  }

  async getContacts(projectId: string): Promise<any[]> {
    if (!db) return [];
    const { data, error } = await db
      .from('project_contacts')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
    return data || [];
  }

  async addContact(projectId: string, input: any): Promise<any> {
    if (!db) throw new Error('Database client not configured');
    const { data, error } = await db
      .from('project_contacts')
      .insert({ project_id: projectId, ...input })
      .select()
      .single();

    if (error) throw new Error(`Failed to add contact: ${error.message}`);
    return data;
  }

  async deleteContact(id: string): Promise<void> {
    if (!db) throw new Error('Database client not configured');
    const { error } = await db
      .from('project_contacts')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete contact: ${error.message}`);
  }

  async getResources(projectId: string): Promise<any[]> {
    if (!db) return [];
    const { data, error } = await db
      .from('project_resources')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch resources: ${error.message}`);
    return data || [];
  }

  async addResource(projectId: string, input: any): Promise<any> {
    if (!db) throw new Error('Database client not configured');
    const { data, error } = await db
      .from('project_resources')
      .insert({ project_id: projectId, ...input })
      .select()
      .single();

    if (error) throw new Error(`Failed to add resource: ${error.message}`);
    return data;
  }

  async deleteResource(id: string): Promise<void> {
    if (!db) throw new Error('Database client not configured');
    const { error } = await db
      .from('project_resources')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete resource: ${error.message}`);
  }

  async getUpdates(projectId: string): Promise<any[]> {
    if (!db) return [];
    const { data, error } = await db
      .from('project_updates')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch updates: ${error.message}`);
    return data || [];
  }

  async addUpdate(projectId: string, input: any, userId: string): Promise<any> {
    if (!db) throw new Error('Database client not configured');
    const { data, error } = await db
      .from('project_updates')
      .insert({ project_id: projectId, created_by: userId, ...input })
      .select()
      .single();

    if (error) throw new Error(`Failed to add update: ${error.message}`);
    return data;
  }

  async getBrokerResources(projectId: string): Promise<any[]> {
    if (!db) return [];
    const { data, error } = await db
      .from('project_broker_resources')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch broker resources: ${error.message}`);
    return data || [];
  }

  async addBrokerResource(projectId: string, input: any): Promise<any> {
    if (!db) throw new Error('Database client not configured');
    const { data, error } = await db
      .from('project_broker_resources')
      .insert({ project_id: projectId, ...input })
      .select()
      .single();

    if (error) throw new Error(`Failed to add broker resource: ${error.message}`);
    return data;
  }

  async deleteBrokerResource(id: string): Promise<void> {
    if (!db) throw new Error('Database client not configured');
    const { error } = await db
      .from('project_broker_resources')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete broker resource: ${error.message}`);
  }

  async incrementDownloadCount(resourceId: string, table: 'project_resources' | 'project_broker_resources'): Promise<void> {
    if (!db) throw new Error('Database client not configured');

    // Fetch current count, increment, update (not atomic but acceptable for MVP)
    const { data: current, error: fetchError } = await db
      .from(table)
      .select('download_count')
      .eq('id', resourceId)
      .single();

    if (fetchError || !current) {
      throw new Error(`Failed to fetch download count: ${fetchError?.message}`);
    }

    const { error: updateError } = await db
      .from(table)
      .update({ download_count: (current.download_count || 0) + 1 })
      .eq('id', resourceId);

    if (updateError) {
      throw new Error(`Failed to increment download count: ${updateError.message}`);
    }
  }
}

export const projectService = new ProjectService();
