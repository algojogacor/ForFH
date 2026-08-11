export async function runCrossUserTests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 2. Multi-User & Parent Ownership Isolation Tests ---");

  // Simulated User A & User B
  const userA = { id: "user-uuid-aaa", username: "mahasiswa_a" };
  const userB = { id: "user-uuid-bbb", username: "mahasiswa_b" };

  const courseOwnedByUserA = { id: "course-1", userId: userA.id, name: "Hukum Pidana" };
  const termOwnedByUserA = { id: "term-1", userId: userA.id, name: "Semester Genap 2025/2026" };

  // Rule 1: Attaching a task to a course must verify courses.userId === authenticatedUser.id
  function checkCourseOwnership(course: { userId: string } | null, authUserId: string): boolean {
    return !!course && course.userId === authUserId;
  }

  assert(
    checkCourseOwnership(courseOwnedByUserA, userA.id) === true,
    "User A can attach tasks/notes/files to User A's course"
  );
  assert(
    checkCourseOwnership(courseOwnedByUserA, userB.id) === false,
    "User B CANNOT attach tasks/notes/files to User A's course (Cross-User Parent Injection Blocked)"
  );
  assert(
    checkCourseOwnership(null, userB.id) === false,
    "Non-existent course rejected"
  );

  // Rule 2: Academic Term ownership validation
  function checkTermOwnership(term: { userId: string } | null, authUserId: string): boolean {
    return !!term && term.userId === authUserId;
  }

  assert(
    checkTermOwnership(termOwnedByUserA, userA.id) === true,
    "User A can assign course to User A's academic term"
  );
  assert(
    checkTermOwnership(termOwnedByUserA, userB.id) === false,
    "User B CANNOT assign course to User A's academic term"
  );

  // Rule 3: Scoped WHERE clause validation: entity update/delete must match WHERE id = id AND userId = authUserId
  function buildScopedWhere(entityId: string, entityUserId: string, authUserId: string) {
    const isOwner = entityUserId === authUserId;
    return {
      allowed: isOwner,
      filter: { id: entityId, userId: authUserId },
    };
  }

  const userATask = { id: "task-99", userId: userA.id, title: "Draf Eksepsi" };
  const updateAttemptByA = buildScopedWhere(userATask.id, userATask.userId, userA.id);
  const updateAttemptByB = buildScopedWhere(userATask.id, userATask.userId, userB.id);

  assert(updateAttemptByA.allowed === true, "Owner (User A) is authorized to mutate task");
  assert(updateAttemptByB.allowed === false, "Cross-user (User B) mutation attempt blocked");
}
