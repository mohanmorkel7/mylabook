import express from 'express';
import { ProductMasterRepository } from '../models/ProductMaster';

const router = express.Router();

// GET /api/product-master
router.get('/', async (req, res) => {
  try {
    const filter: any = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.is_active !== undefined)
      filter.is_active = req.query.is_active === 'true';
    const rows = await ProductMasterRepository.getAll(filter);
    res.json(rows);
  } catch (e: any) {
    console.error('Failed to fetch product_master:', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch' });
  }
});

// POST /api/product-master
router.post('/', async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.name) return res.status(400).json({ error: 'Missing name' });
    const created = await ProductMasterRepository.create({
      name: data.name,
      description: data.description,
      current_version: data.current_version,
      repository_url: data.repository_url,
      product_url: data.product_url,
      is_active: data.is_active,
      status: data.status,
      created_by: data.created_by,
    });
    res.status(201).json(created);
  } catch (e: any) {
    console.error('Failed to create product_master:', e);
    res.status(500).json({ error: e?.message || 'Failed to create' });
  }
});

// GET /api/product-master/:id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await ProductMasterRepository.getById(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) {
    console.error('Failed to fetch product_master row:', e);
    res.status(500).json({ error: e?.message || 'Failed' });
  }
});

// PUT /api/product-master/:id
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = req.body || {};
    const updated = await ProductMasterRepository.update(id, data);
    if (!updated) return res.status(404).json({ error: 'Not found or no fields' });
    res.json(updated);
  } catch (e: any) {
    console.error('Failed to update product_master:', e);
    res.status(500).json({ error: e?.message || 'Failed' });
  }
});

// DELETE /api/product-master/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await ProductMasterRepository.delete(id);
    res.status(204).json({});
  } catch (e: any) {
    console.error('Failed to delete product_master:', e);
    res.status(500).json({ error: e?.message || 'Failed' });
  }
});

export default router;
