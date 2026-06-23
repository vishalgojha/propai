import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  createProjectSchema,
  updateProjectSchema,
  createInventorySchema,
  updateInventorySchema,
  createContactSchema,
  createResourceSchema,
  createUpdateSchema,
  brokerResourceSchema,
  projectSearchSchema,
} from '../schemas/projectSchemas';
import {
  createProject,
  updateProject,
  getProject,
  searchProjects,
  listMyProjects,
  addInventory,
  updateInventory,
  deleteInventory,
  addContact,
  deleteContact,
  addResource,
  deleteResource,
  addUpdate,
  addBrokerResource,
  deleteBrokerResource,
  recordDownload,
} from '../controllers/projectController';

const router = Router();

// Public search — no auth required
router.get('/search', validate(projectSearchSchema, 'query'), searchProjects);

// Public single project — no auth required (auth checked inside for unpublished)
router.get('/:id', getProject);

// Authenticated routes
router.use(authMiddleware);

router.post('/', validate(createProjectSchema, 'body'), createProject);
router.put('/:id', validate(updateProjectSchema, 'body'), updateProject);

router.get('/mine/list', listMyProjects);

// Inventory
router.post('/:id/inventory', validate(createInventorySchema, 'body'), addInventory);
router.put('/inventory/:id', validate(updateInventorySchema, 'body'), updateInventory);
router.delete('/inventory/:id', deleteInventory);

// Contacts
router.post('/:id/contacts', validate(createContactSchema, 'body'), addContact);
router.delete('/contacts/:id', deleteContact);

// Resources
router.post('/:id/resources', validate(createResourceSchema, 'body'), addResource);
router.delete('/resources/:id', deleteResource);

// Updates
router.post('/:id/updates', validate(createUpdateSchema, 'body'), addUpdate);

// Broker resources
router.post('/:id/broker-resources', validate(brokerResourceSchema, 'body'), addBrokerResource);
router.delete('/broker-resources/:id', deleteBrokerResource);

// Download tracking
router.post('/download/:table/:resourceId', recordDownload);

export default router;
