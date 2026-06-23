import { z } from 'zod';

export const parseProjectBrochureSchema = z.object({
  base64: z.string().min(1),
  fileName: z.string().max(200).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  developer_name: z.string().min(1).max(200),
  description: z.string().optional(),
  locality: z.string().min(1).max(100),
  city: z.string().default('Mumbai'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.enum(['upcoming', 'ongoing', 'ready-possession', 'completed']).default('upcoming'),
  possession_date: z.string().optional(),
  rera_number: z.string().optional(),
  configurations: z.array(z.string()).default([]),
  total_towers: z.number().int().default(1),
  total_floors: z.number().int().optional(),
  total_units: z.number().int().optional(),
  amenities: z.array(z.string()).default([]),
  gallery: z.array(z.string()).default([]),
  floor_plans: z.array(z.object({
    bhk: z.string(),
    area: z.number(),
    image: z.string().optional(),
  })).default([]),
  logo_url: z.string().optional(),
  cover_image_url: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  is_verified: z.boolean().optional(),
  is_published: z.boolean().optional(),
});

export const createInventorySchema = z.object({
  bhk: z.string().min(1),
  unit_number: z.string().optional(),
  floor: z.number().int().optional(),
  total_floors: z.number().int().optional(),
  carpet_area: z.number().optional(),
  built_up_area: z.number().optional(),
  price_numeric: z.number().positive(),
  furnishing: z.enum(['Unfurnished', 'Semi Furnished', 'Full Furnished']).default('Unfurnished'),
  status: z.enum(['available', 'sold', 'blocked']).default('available'),
  listing_ref: z.string().optional(),
});

export const updateInventorySchema = createInventorySchema.partial();

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  whatsapp_phone: z.string().optional(),
  is_primary: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const createResourceSchema = z.object({
  title: z.string().min(1).max(200),
  file_type: z.enum(['brochure', 'inventory_sheet', 'cost_sheet', 'floor_plan', 'payment_plan', 'presentation', 'other']),
  file_url: z.string().url(),
  file_size: z.number().optional(),
  mime_type: z.string().optional(),
  is_broker_only: z.boolean().default(false),
});

export const createUpdateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  update_type: z.enum(['price_revision', 'new_tower', 'inventory_release', 'scheme', 'broker_incentive', 'possession', 'general']),
});

export const brokerResourceSchema = z.object({
  title: z.string().min(1).max(200),
  file_url: z.string().url(),
  file_size: z.number().optional(),
  mime_type: z.string().optional(),
});

export const projectSearchSchema = z.object({
  q: z.string().optional(),
  locality: z.string().optional(),
  city: z.string().optional(),
  developer: z.string().optional(),
  configuration: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
