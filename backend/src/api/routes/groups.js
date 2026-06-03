const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');

router.get('/', roleCheck('admin', 'receptionist', 'teacher'), async (req, res) => {
  const { subjectId, status = 'active' } = req.query;
  const where = { status };
  if (subjectId) where.subjectId = parseInt(subjectId);
  const groups = await prisma.group.findMany({
    where,
    include: {
      subject: true,
      teacher: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { groupStudents: { where: { status: 'active' } } } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(groups);
});

router.get('/my', roleCheck('teacher'), async (req, res) => {
  const groups = await prisma.group.findMany({
    where: { teacherId: req.user.id, status: 'active' },
    include: {
      subject: true,
      _count: { select: { groupStudents: { where: { status: 'active' } } } }
    }
  });
  res.json(groups);
});

router.get('/:id/students', roleCheck('admin', 'receptionist', 'teacher'), async (req, res) => {
  const { status = 'active' } = req.query;
  const gs = await prisma.groupStudent.findMany({
    where: { groupId: parseInt(req.params.id), status },
    include: {
      student: {
        include: {
          applicant: { select: { firstName: true, lastName: true, phoneSelf: true, phoneFather: true, phoneMother: true } }
        }
      }
    },
    orderBy: { student: { applicant: { firstName: 'asc' } } }
  });
  res.json(gs.map(g => ({
    id: g.student.id,
    groupStudentId: g.id,
    firstName: g.student.applicant.firstName,
    lastName: g.student.applicant.lastName,
    phoneSelf: g.student.applicant.phoneSelf,
    phoneFather: g.student.applicant.phoneFather,
    phoneMother: g.student.applicant.phoneMother,
    status: g.status,
    joinedAt: g.joinedAt
  })));
});

router.get('/:id/teacher-history', roleCheck('admin', 'receptionist'), async (req, res) => {
  const history = await prisma.groupTeacherHistory.findMany({
    where: { groupId: parseInt(req.params.id) },
    include: { teacher: { select: { firstName: true, lastName: true, subject: true } } },
    orderBy: { startDate: 'desc' }
  });
  res.json(history);
});

router.post('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { name, subjectId, teacherId } = req.body;
    if (!name || !subjectId || !teacherId) return res.status(400).json({ error: 'Barcha maydonlar kerak' });

    const group = await prisma.group.create({
      data: { name, subjectId: parseInt(subjectId), teacherId: parseInt(teacherId) },
      include: { subject: true, teacher: true }
    });

    // Save teacher history
    await prisma.groupTeacherHistory.create({
      data: { groupId: group.id, teacherId: parseInt(teacherId) }
    });

    res.json(group);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { name, teacherId } = req.body;
    const groupId = parseInt(req.params.id);

    const current = await prisma.group.findUnique({ where: { id: groupId } });

    // If teacher changed, update history
    if (teacherId && current.teacherId !== parseInt(teacherId)) {
      // Close current history
      if (current.teacherId) {
        await prisma.groupTeacherHistory.updateMany({
          where: { groupId, endDate: null, teacherId: current.teacherId },
          data: { endDate: new Date() }
        });
      }
      // Create new history
      await prisma.groupTeacherHistory.create({
        data: { groupId, teacherId: parseInt(teacherId) }
      });
    }

    const group = await prisma.group.update({
      where: { id: groupId },
      data: { name, teacherId: teacherId ? parseInt(teacherId) : undefined }
    });
    res.json(group);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { action } = req.query;
  if (action === 'archive') {
    await prisma.group.update({ where: { id: parseInt(req.params.id) }, data: { status: 'archived' } });
  } else {
    await prisma.group.delete({ where: { id: parseInt(req.params.id) } });
  }
  res.json({ success: true });
});

module.exports = router;
