// backend/controllers/truckExpenseController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// GET /api/truck-expenses?truck_id=TRK-001&from=2025-01-01&to=2025-12-31
export const listExpenses = async (req, res) => {
  try {
    const { truck_id, from, to } = req.query;
    const where = {};
    if (truck_id) where.truck_id = String(truck_id);
    if (from || to) {
      where.expense_date = {};
      if (from) where.expense_date.gte = new Date(from);
      if (to)   where.expense_date.lte = new Date(to);
    }
    const rows = await prisma.truckExpense.findMany({
      where,
      orderBy: [{ expense_date: 'desc' }, { id: 'desc' }],
    });
    res.json(rows);
  } catch (e) {
    console.error('listExpenses error:', e);
    res.status(500).json({ message: 'Cannot list expenses' });
  }
};

// GET /api/truck-expenses/:id
export const getExpense = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.truckExpense.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error('getExpense error:', e);
    res.status(400).json({ message: 'Cannot get expense' });
  }
};

// POST /api/truck-expenses   { truck_id, expense_date, description, amount }
export const createExpense = async (req, res) => {
  try {
    const { truck_id, expense_date, description, amount } = req.body;
    if (!truck_id || !expense_date)
      return res.status(400).json({ message: 'truck_id & expense_date are required' });

    const created = await prisma.truckExpense.create({
      data: {
        truck_id,
        expense_date: new Date(expense_date),
        description: description ?? null,
        amount: Number(amount || 0),
      },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('createExpense error:', e);
    res.status(400).json({ message: 'Cannot create expense' });
  }
};

// PUT /api/truck-expenses/:id  { expense_date?, description?, amount? }
export const updateExpense = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { truck_id, expense_date, description, amount } = req.body;

    const updated = await prisma.truckExpense.update({
      where: { id },
      data: {
        ...(truck_id !== undefined ? { truck_id } : {}),
        ...(expense_date !== undefined ? { expense_date: new Date(expense_date) } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(amount !== undefined ? { amount: Number(amount) } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    console.error('updateExpense error:', e);
    if (e.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    res.status(400).json({ message: 'Cannot update expense' });
  }
};

// DELETE /api/truck-expenses/:id
export const deleteExpense = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.truckExpense.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('deleteExpense error:', e);
    if (e.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    res.status(400).json({ message: 'Cannot delete expense' });
  }
};
