import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
const prisma = new PrismaClient();


function safeUnlink(filePath) {
  if (!filePath) return;
  const localPath = filePath.startsWith('/uploads')
    ? filePath.slice(1)
    : filePath;
  try {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch (_) {}
}

// POST /api/employees/:id/photo  (ใช้ร่วมกับ upload middleware .single('image'))
// อัปโหลดรูปโปรไฟล์พนักงาน
export const uploadEmployeePhoto = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดไฟล์รูปในฟิลด์ "image"' });
    }

    // หา employee
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      // ลบไฟล์ที่เพิ่งอัปถ้าไม่พบ employee
      safeUnlink(req.file.path);
      return res.status(404).json({ message: 'ไม่พบพนักงาน' });
    }

    // path สำหรับเสิร์ฟสาธารณะ (app.use('/uploads', express.static('uploads')))
    const publicPath = `/uploads/employees/${path.basename(req.file.path)}`;

    // ลบรูปเก่า (ถ้ามี)
    if (employee.profileImagePath && employee.profileImagePath !== publicPath) {
      safeUnlink(employee.profileImagePath);
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: { profileImagePath: publicPath },
      select: { id: true, name: true, profileImagePath: true },
    });

    return res.status(200).json({
      message: 'อัปโหลดรูปโปรไฟล์เรียบร้อย',
      data: updated,
    });
  } catch (err) {
    if (req.file?.path) safeUnlink(req.file.path);
    console.error(err);
    return res.status(500).json({ message: 'อัปโหลดรูปไม่สำเร็จ', error: err.message });
  }
};

// ลบรูปโปรไฟล์พนักงาน
// DELETE /api/employees/:id/photo
export const deleteEmployeePhoto = async (req, res) => {
  try {
    const { id } = req.params;

    const emp = await prisma.employee.findUnique({ where: { id } });
    if (!emp) return res.status(404).json({ message: 'ไม่พบพนักงาน' });

    if (emp.profileImagePath) {
      safeUnlink(emp.profileImagePath);
    }

    await prisma.employee.update({
      where: { id },
      data: { profileImagePath: null },
    });

    return res.status(200).json({ message: 'ลบรูปโปรไฟล์เรียบร้อย' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'ลบรูปไม่สำเร็จ', error: err.message });
  }
};


//  ดึงพนักงานทั้งหมด
export const getAllEmployees = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        position: true,
        phone: true,
        email: true,
        profileImagePath: true
      }
    });
    res.json(employees);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

//  ดึงพนักงานตาม id (แบบ summary)
export const getEmployeeSummary = async (req, res) => {
  const { id } = req.params;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        Attendance: {
          select: { check_in: true, check_out: true },
          orderBy: { check_in: 'desc' },
        },
        JobAssignment: {
          include: {
            Trip: {
              select: {
                distance_km: true,
                fuel_used_liters: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    let totalTrips = 0;
    let totalDistance = 0;
    // NOTE: ยังไม่คำนวณค่าเชื้อเพลิง เพราะ schema ไม่มี fuelCost ใน Trip
    employee.JobAssignment.forEach(job => {
      totalTrips += job.Trip.length;
      job.Trip.forEach(trip => {
        totalDistance += trip.distance_km || 0;
      });
    });

    res.json({
      id: employee.id,
      name: employee.name,
      position: employee.position,
      phone: employee.phone,
      email: employee.email,
      profileImagePath: employee.profileImagePath,
      totalTrips,
      totalDistance,
      attendances: employee.Attendance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



// เพิ่มพนักงานใหม่
export const createEmployee = async (req, res) => {
  const { name, position, phone, email, profileImagePath } = req.body;

  if (!name || !position || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const employees = await prisma.employee.findMany({
      select: { id: true }
    });

    const maxNumber = employees.reduce((max, emp) => {
      const match = emp.id.match(/^EMP(\d{3})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const newId = `EMP${String(maxNumber + 1).padStart(3, '0')}`;

    const newEmployee = await prisma.employee.create({
      data: {
        id: newId,
        name,
        position,
        phone,
        email,
        profileImagePath
      }
    });

    res.status(201).json(newEmployee);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
};



// ลบพนักงาน
export const deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const emp = await prisma.employee.findUnique({ where: { id } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    if (emp.profileImagePath) safeUnlink(emp.profileImagePath);

    await prisma.employee.delete({ where: { id } });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};



//  แก้ไขพนักงาน
export const updateEmployee = async (req, res) => {
  const { id } = req.params;
  const { name, position, phone, email } = req.body;

  try {
    const updated = await prisma.employee.update({
      where: { id }, // id เป็น string แล้ว
      data: { name, position, phone, email }
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.error(error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
};




