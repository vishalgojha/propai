import { Request, Response } from 'express';
import { projectService } from '../services/projectService';
import { workspaceAccessService } from '../services/workspaceAccessService';

function firstString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? String(id[0] || '') : String(id || '');
}

async function resolveContext(req: Request) {
  return workspaceAccessService.resolveContext((req as any).user ?? {});
}

export const createProject = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const tenantId = context.workspaceOwnerId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const project = await projectService.create({
      tenantId,
      ...req.body,
    });

    return res.status(201).json({ success: true, project });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to create project' });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    if (!context.workspaceOwnerId) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = paramId(req);
    const existing = await projectService.findById(projectId);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    if (existing.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const project = await projectService.update(projectId, req.body);
    return res.json({ success: true, project });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to update project' });
  }
};

export const getProject = async (req: Request, res: Response) => {
  try {
    const slugOrId = paramId(req);
    let project = await projectService.findBySlug(slugOrId);
    if (!project) project = await projectService.findById(slugOrId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.is_published) {
      const context = await resolveContext(req);
      if (project.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
        return res.status(404).json({ error: 'Project not found' });
      }
    }

    const [inventory, contacts, resources, updates, brokerResources] = await Promise.all([
      projectService.getInventory(project.id),
      projectService.getContacts(project.id),
      projectService.getResources(project.id),
      projectService.getUpdates(project.id),
      projectService.getBrokerResources(project.id),
    ]);

    return res.json({
      success: true,
      project: {
        ...project,
        inventory,
        contacts,
        resources,
        updates,
        broker_resources: brokerResources,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch project' });
  }
};

export const searchProjects = async (req: Request, res: Response) => {
  try {
    const { q, locality, city, developer, configuration, status, limit, offset } = req.query as Record<string, string | undefined>;

    const result = await projectService.search({
      q: q ? String(q) : undefined,
      locality: locality ? String(locality) : undefined,
      city: city ? String(city) : undefined,
      developer: developer ? String(developer) : undefined,
      configuration: configuration ? String(configuration) : undefined,
      status: status ? String(status) : undefined,
      limit: limit ? parseInt(String(limit), 10) : 20,
      offset: offset ? parseInt(String(offset), 10) : 0,
    });

    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Search failed' });
  }
};

export const listMyProjects = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const tenantId = context.workspaceOwnerId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await projectService.search({ tenant_id: tenantId });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to list projects' });
  }
};

export const addInventory = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const projectId = paramId(req);

    const project = await projectService.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const items = Array.isArray(req.body) ? req.body : [req.body];
    const inventory = await projectService.addInventory(projectId, items);
    return res.status(201).json({ success: true, inventory });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to add inventory' });
  }
};

export const updateInventory = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const inventoryId = paramId(req);
    const inventory = await projectService.updateInventory(inventoryId, req.body);
    return res.json({ success: true, inventory });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to update inventory' });
  }
};

export const deleteInventory = async (req: Request, res: Response) => {
  try {
    await projectService.deleteInventory(paramId(req));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delete inventory' });
  }
};

export const addContact = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const projectId = paramId(req);

    const project = await projectService.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contact = await projectService.addContact(projectId, req.body);
    return res.status(201).json({ success: true, contact });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to add contact' });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    await projectService.deleteContact(paramId(req));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delete contact' });
  }
};

export const addResource = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const projectId = paramId(req);

    const project = await projectService.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const resource = await projectService.addResource(projectId, req.body);
    return res.status(201).json({ success: true, resource });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to add resource' });
  }
};

export const deleteResource = async (req: Request, res: Response) => {
  try {
    await projectService.deleteResource(paramId(req));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delete resource' });
  }
};

export const addUpdate = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const projectId = paramId(req);

    const project = await projectService.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const update = await projectService.addUpdate(projectId, req.body, context.currentUserId);
    return res.status(201).json({ success: true, update });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to add update' });
  }
};

export const addBrokerResource = async (req: Request, res: Response) => {
  try {
    const context = await resolveContext(req);
    const projectId = paramId(req);

    const project = await projectService.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.tenant_id !== context.workspaceOwnerId && !context.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const resource = await projectService.addBrokerResource(projectId, req.body);
    return res.status(201).json({ success: true, resource });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to add broker resource' });
  }
};

export const deleteBrokerResource = async (req: Request, res: Response) => {
  try {
    await projectService.deleteBrokerResource(paramId(req));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delete broker resource' });
  }
};

export const recordDownload = async (req: Request, res: Response) => {
  try {
    const resourceId = String(req.params.resourceId);
    const table = String(req.params.table) as 'project_resources' | 'project_broker_resources';
    await projectService.incrementDownloadCount(resourceId, table || 'project_resources');
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to record download' });
  }
};
