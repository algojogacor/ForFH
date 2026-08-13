import { redirect } from "next/navigation";
import { eq, and, isNull, asc, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db, campusAccounts, classSchedules, courses, tasks, exams } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer } from "@/components/ui/PageContainer";
import { DashboardClientView } from "@/components/dashboard/DashboardClientView";
import { SyncProgressCard } from "@/components/campus/SyncProgressCard";
import { formatDateIndonesian } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const hour = now.getHours();
  let timeGreeting = "Selamat pagi";
  if (hour >= 11 && hour < 15) timeGreeting = "Selamat siang";
  else if (hour >= 15 && hour < 18) timeGreeting = "Selamat sore";
  else if (hour >= 18 || hour < 5) timeGreeting = "Selamat malam";

  // 1. Fetch today's class schedules
  const todaySchedules = await db
    .select({
      id: classSchedules.id,
      courseId: classSchedules.courseId,
      courseName: courses.name,
      courseCode: courses.code,
      credits: courses.credits,
      lecturer: courses.lecturer,
      startTime: classSchedules.startTime,
      endTime: classSchedules.endTime,
      room: classSchedules.room,
      onlineUrl: classSchedules.onlineUrl,
    })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(
      and(
        eq(classSchedules.userId, user.id),
        eq(classSchedules.enabled, 1),
        eq(classSchedules.dayOfWeek, currentDayOfWeek)
      )
    )
    .orderBy(asc(classSchedules.startTime));

  // 2. Determine next class occurrence & countdown
  let nextClass: any = null;
  for (const s of todaySchedules) {
    const [h, m] = s.startTime.split(":").map((x) => parseInt(x, 10));
    const classMinutes = h * 60 + m;
    if (classMinutes >= currentMinutes) {
      const diffMinutes = classMinutes - currentMinutes;
      const hoursLeft = Math.floor(diffMinutes / 60);
      const minsLeft = diffMinutes % 60;
      const timeRemaining =
        hoursLeft > 0
          ? `${hoursLeft} jam ${minsLeft} menit lagi`
          : `${minsLeft} menit lagi`;

      nextClass = {
        ...s,
        timeRemaining,
      };
      break;
    }
  }

  // 3. Fetch active tasks & deadlines
  const allTasks = await db.query.tasks.findMany({
    where: and(eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
    orderBy: [desc(tasks.priority), asc(tasks.dueAt)],
    with: { course: true, subtasks: true },
  });

  const activeTasks = allTasks.filter((t) => t.status !== "DONE");
  const completedTasks = allTasks.filter((t) => t.status === "DONE");

  const formattedTasks = activeTasks.map((t) => ({
    id: t.id,
    title: t.title,
    courseName: t.course?.name || "Umum",
    dueAt: t.dueAt,
    priority: t.priority,
    type: t.type,
    subtasksCount: t.subtasks?.length || 0,
    completedSubtasksCount: t.subtasks?.filter((st) => st.completed === 1).length || 0,
  }));

  // 4. Fetch upcoming exams
  const rawExams = await db.query.exams.findMany({
    where: eq(exams.userId, user.id),
    orderBy: [asc(exams.examAt)],
    with: { course: true },
    limit: 4,
  });

  const formattedExams = rawExams.map((e) => {
    const diffDays = Math.ceil((e.examAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: e.id,
      name: e.name,
      courseName: e.course?.name || "Umum",
      examAt: e.examAt,
      daysRemaining: diffDays > 0 ? diffDays : 0,
    };
  });

  const totalTasks = allTasks.length;
  const completedCount = completedTasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const userDisplayName = user.displayName || user.username || "Mahasiswa";

  const dashboardData = {
    todaySchedules,
    nextClass,
    urgentTasks: formattedTasks,
    upcomingExams: formattedExams,
    progress: {
      completed: completedCount,
      total: totalTasks,
      percent: progressPercent,
    },
    userDisplayName,
    greeting: `${timeGreeting}, ${userDisplayName}`,
    dateString: formatDateIndonesian(now, false),
  };

  // 5. Koneksi akun kampus (gate untuk SyncProgressCard)
  const campusAcc = await db.query.campusAccounts.findFirst({
    where: eq(campusAccounts.userId, user.id),
  });

  return (
    <AppShell user={user}>
      <PageContainer variant="wide">
        {campusAcc ? <SyncProgressCard className="mb-4" /> : null}
        <DashboardClientView initialData={dashboardData} />
      </PageContainer>
    </AppShell>
  );
}
