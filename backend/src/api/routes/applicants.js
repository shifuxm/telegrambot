const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');

router.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { search } = req.query;

  // waiting + qisman biriktirilganlar (enrolled lekin ba'zi fanlar guruhsiz)
  const baseWhere = {};
  if (search) baseWhere.OR = [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } }
  ];

  // waiting statusdagilar
  const waiting = await prisma.applicant.findMany({
    where: { ...baseWhere, status: 'waiting' },
    include: {
      applicantSubjects: { include: { subject: true } },
      student: {
        include: {
          groupStudents: {
            where: { status: 'active' },
            include: { group: { include: { subject: true } } }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // enrolled lekin barcha fanlarga biriktirilmagan (qisman)
  const enrolled = await prisma.applicant.findMany({
    where: { ...baseWhere, status: 'enrolled' },
    include: {
      applicantSubjects: { include: { subject: true } },
      student: {
        include: {
          groupStudents: {
            where: { status: 'active' },
            include: { group: { include: { subject: true } } }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Qisman biriktirilganlarni topish
  const partial = enrolled.filter(a => {
    if (!a.student) return false;
    const enrolledSubjectIds = new Set(a.student.groupStudents.map(gs => gs.group.subjectId));
    const requiredSubjectIds = a.applicantSubjects.map(s => s.subjectId);
    return requiredSubjectIds.some(sid => !enrolledSubjectIds.has(sid));
  });

  res.json([...waiting, ...partial]);
});

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, educationType, grade, phoneSelf, phoneFather, phoneMother, subjectIds } = req.body;
    if (!firstName || !lastName || !educationType) return res.status(400).json({ error: 'Ism, familya, o\'qish joyi kerak' });
    if (!phoneSelf && !phoneFather && !phoneMother) return res.status(400).json({ error: 'Kamida bitta telefon kerak' });
    if (!subjectIds?.length) return res.status(400).json({ error: 'Kamida bitta fan tanlang' });

    const applicant = await prisma.applicant.create({
      data: {
        firstName, lastName, educationType, grade,
        phoneSelf, phoneFather, phoneMother,
        applicantSubjects: { create: subjectIds.map(id => ({ subjectId: parseInt(id) })) }
      },
      include: { applicantSubjects: { include: { subject: true } } }
    });
    res.json(applicant);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/enroll', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { groupAssignments } = req.body;
    const applicantId = parseInt(req.params.id);

    let student = await prisma.student.findUnique({ where: { applicantId } });
    if (!student) student = await prisma.student.create({ data: { applicantId } });

    for (const { groupId } of groupAssignments) {
      const gid = parseInt(groupId);
      // Bu guruhning fanini topamiz
      const grp = await prisma.group.findUnique({ where: { id: gid }, select: { subjectId: true } });
      if (grp) {
        // Bir xil fandagi boshqa guruhlarni arxivlaymiz
        const sameSubjectGs = await prisma.groupStudent.findMany({
          where: { studentId: student.id, status: 'active', group: { subjectId: grp.subjectId } }
        });
        for (const sg of sameSubjectGs) {
          if (sg.groupId !== gid) {
            await prisma.groupStudent.update({ where: { id: sg.id }, data: { status: 'archived' } });
          }
        }
      }
      await prisma.groupStudent.upsert({
        where: { groupId_studentId: { groupId: gid, studentId: student.id } },
        update: { status: 'active' },
        create: { groupId: gid, studentId: student.id }
      });
    }

    // Barcha fanlarga biriktirilganmi tekshiramiz
    if (groupAssignments.length > 0) {
      const applicant = await prisma.applicant.findUnique({
        where: { id: applicantId },
        include: { applicantSubjects: true }
      });
      const allGroupStudents = await prisma.groupStudent.findMany({
        where: { studentId: student.id, status: 'active' },
        include: { group: true }
      });
      const enrolledSubjectIds = new Set(allGroupStudents.map(gs => gs.group.subjectId));
      const allEnrolled = applicant.applicantSubjects.every(as => enrolledSubjectIds.has(as.subjectId));

      if (allEnrolled) {
        await prisma.applicant.update({ where: { id: applicantId }, data: { status: 'enrolled' } });
      } else {
        // Qisman biriktirildi - enrolled deb belgilaymiz lekin ro'yxatdan o'chirmaydi
        await prisma.applicant.update({ where: { id: applicantId }, data: { status: 'enrolled' } });
      }
    }

    res.json({ success: true, studentId: student.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', roleCheck('admin', 'receptionist'), async (req, res) => {
  await prisma.applicant.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

module.exports = router;
