const router = require('express').Router();
const prisma  = require('../../db');
const roleCheck = require('../middleware/roleCheck');

// Guruh reytingi (oy bo'yicha)
router.get('/group/:groupId', async (req, res) => {
  try {
    const { monthYear } = req.query;
    const where = { groupId: parseInt(req.params.groupId) };
    if (monthYear) where.monthYear = monthYear;

    const students = await prisma.groupStudent.findMany({
      where: { groupId: parseInt(req.params.groupId), status: 'active' },
      include: { student: { include: { applicant: { select: { firstName: true, lastName: true } } } } }
    });

    const ratings = await prisma.rating.findMany({ where });
    const rMap = {};
    ratings.forEach(r => { rMap[r.studentId] = r; });

    const result = students.map(gs => ({
      studentId: gs.student.id,
      firstName: gs.student.applicant.firstName,
      lastName:  gs.student.applicant.lastName,
      rating: rMap[gs.student.id] ? {
        score:   rMap[gs.student.id].score,
        comment: rMap[gs.student.id].comment
      } : null
    }));

    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ball qo'shish yoki yangilash
router.post('/add/:studentId', roleCheck('teacher', 'admin'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { groupId, addScore, comment, monthYear } = req.body;
    if (!groupId || addScore === undefined) return res.status(400).json({ error: 'groupId va addScore kerak' });

    const existing = await prisma.rating.findUnique({
      where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } }
    });

    const rating = await prisma.rating.upsert({
      where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } },
      update: {
        score: (existing?.score || 0) + parseInt(addScore),
        comment: comment || existing?.comment || null,
        teacherId: req.user?.id || null
      },
      create: {
        studentId, groupId: parseInt(groupId), monthYear,
        score: parseInt(addScore),
        comment: comment || null,
        teacherId: req.user?.id || null
      }
    });

    res.json({ ...rating });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Rating reset (admin)
router.delete('/reset/:groupId', roleCheck('admin'), async (req, res) => {
  try {
    const { monthYear } = req.query;
    await prisma.rating.deleteMany({ where: { groupId: parseInt(req.params.groupId), monthYear } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
