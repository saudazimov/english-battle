const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const pool = require("../db");

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const suffix = String(Date.now()).slice(-7);
const password = "E2eTest123!";
const changedPassword = "E2eChanged456!";
const fixture = { userIds: [], classId: null, assignmentId: null, questionId: null };

async function api(path, options = {}) {
  const response = await fetch(baseUrl + path, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = { raw: text }; }
  return { response, body };
}

function auth(token) {
  return { "Content-Type": "application/json", Authorization: "Bearer " + token };
}

async function cleanup() {
  if (!fixture.userIds.length) return;
  const ids = fixture.userIds;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM notifications WHERE user_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM teacher_messages WHERE teacher_id = ANY($1::int[]) OR student_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM submission_answers WHERE submission_id IN (SELECT id FROM assignment_submissions WHERE student_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM assignment_submissions WHERE student_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM assignment_questions WHERE assignment_id IN (SELECT id FROM assignments WHERE teacher_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM assignments WHERE teacher_id = ANY($1::int[])", [ids]);
    if (fixture.questionId) {
      await client.query("DELETE FROM questions WHERE id = $1", [fixture.questionId]);
    }
    await client.query("DELETE FROM class_students WHERE student_id = ANY($1::int[]) OR class_id IN (SELECT id FROM classes WHERE teacher_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM classes WHERE teacher_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM request_rate_limits WHERE bucket='direct_message' AND key_value = ANY($1::text[])", [ids.map(String)]);
    await client.query("DELETE FROM users WHERE id = ANY($1::int[])", [ids]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test("student and teacher complete the core platform flow", async (t) => {
  const ready = await api("/ready");
  assert.equal(ready.response.status, 200, "Local server must be running before E2E tests");

  const hash = await bcrypt.hash(password, 6);
  const teacherPhone = "+99890" + suffix;
  const studentPhone = "+99891" + suffix;
  const inserted = await pool.query(
    `INSERT INTO users (first_name,last_name,phone,password,role,username,country,region,district,school)
     VALUES
       ('E2E','Teacher',$1,$3,'teacher',$4,'UZ','Toshkent','Chilonzor','42-maktab'),
       ('E2E','Student',$2,$3,'student',$5,'UZ','Toshkent','Chilonzor','42-maktab')
     RETURNING id, role, phone`,
    [teacherPhone, studentPhone, hash, "e2e_teacher_" + suffix, "e2e_student_" + suffix]
  );
  const teacher = inserted.rows.find((row) => row.role === "teacher");
  const student = inserted.rows.find((row) => row.role === "student");
  fixture.userIds.push(teacher.id, student.id);
  t.after(async () => { await cleanup(); await pool.end(); });

  const question = await pool.query(
    `INSERT INTO questions
       (question_text, option_a, option_b, option_c, option_d, correct_option,
        cefr_level, skill, difficulty, explanation, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      "E2E: Choose the correct form: I ___ ready.",
      "am", "is", "are", "be", "A", "A1", "grammar", "easy",
      "The subject 'I' uses 'am'.", "published",
    ]
  );
  fixture.questionId = question.rows[0].id;

  const wrong = await api("/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: studentPhone, password: "wrong-password" }),
  });
  assert.equal(wrong.response.status, 400);

  const teacherLogin = await api("/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: teacherPhone, password }),
  });
  const studentLogin = await api("/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: studentPhone, password }),
  });
  assert.equal(teacherLogin.response.status, 200);
  assert.equal(studentLogin.response.status, 200);
  let teacherToken = teacherLogin.body.token;
  let studentToken = studentLogin.body.token;

  const createdClass = await api("/teacher/classes", {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ name: "E2E English Class", description: "Automated end-to-end test" }),
  });
  assert.equal(createdClass.response.status, 201, JSON.stringify(createdClass.body));
  fixture.classId = createdClass.body.class.id;

  const joined = await api("/student/join-class", {
    method: "POST", headers: auth(studentToken),
    body: JSON.stringify({ join_code: createdClass.body.class.join_code }),
  });
  assert.equal(joined.response.status, 201, JSON.stringify(joined.body));

  const studentMessage = await api(`/student/teachers/${teacher.id}/messages`, {
    method: "POST", headers: auth(studentToken),
    body: JSON.stringify({ message: "E2E: Assalomu alaykum, ustoz!" }),
  });
  assert.equal(studentMessage.response.status, 200, JSON.stringify(studentMessage.body));

  const conversations = await api("/teacher/conversations", { headers: auth(teacherToken) });
  assert.equal(conversations.response.status, 200);
  assert.ok(conversations.body.conversations.some((item) => Number(item.id) === student.id));

  const teacherReply = await api(`/teacher/conversations/${student.id}/messages`, {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ message: "E2E: Va alaykum assalom!" }),
  });
  assert.equal(teacherReply.response.status, 200, JSON.stringify(teacherReply.body));

  const assignment = await api(`/teacher/classes/${fixture.classId}/assignments`, {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ title: "E2E A1 Assignment", description: "Core flow", cefr_level: "A1", skill: "mixed", question_count: 1, max_attempts: 1 }),
  });
  assert.equal(assignment.response.status, 201, JSON.stringify(assignment.body));
  fixture.assignmentId = assignment.body.assignment.id;

  const started = await api(`/student/assignments/${fixture.assignmentId}/start`, { headers: auth(studentToken) });
  assert.equal(started.response.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.questions.length, 1);
  assert.equal(Object.hasOwn(started.body.questions[0], "correct_answer"), false);

  const submitted = await api(`/student/assignments/${fixture.assignmentId}/submit`, {
    method: "POST", headers: auth(studentToken),
    body: JSON.stringify({ answers: [{ assignment_question_id: started.body.questions[0].assignment_question_id, answer: "A" }] }),
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.result.total, 1);

  const announcement = await api(`/teacher/classes/${fixture.classId}/announcements`, {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ title: "E2E Announcement", body: "Tomorrow at 10:00", is_pinned: true }),
  });
  assert.equal(announcement.response.status, 201, JSON.stringify(announcement.body));
  const studentAnnouncements = await api(`/student/classes/${fixture.classId}/announcements`, { headers: auth(studentToken) });
  assert.equal(studentAnnouncements.response.status, 200);
  assert.equal(studentAnnouncements.body.announcements[0].title, "E2E Announcement");

  const ranking = await api(`/student/classes/${fixture.classId}/ranking`, { headers: auth(studentToken) });
  assert.equal(ranking.response.status, 200, JSON.stringify(ranking.body));
  assert.equal(ranking.body.my_rank, 1);

  const attendance = await api(`/teacher/classes/${fixture.classId}/attendance`, {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ title: "E2E Lesson", session_date: "2026-07-24" }),
  });
  assert.equal(attendance.response.status, 201, JSON.stringify(attendance.body));
  const attendanceSaved = await api(`/teacher/classes/${fixture.classId}/attendance/${attendance.body.session.id}`, {
    method: "PUT", headers: auth(teacherToken),
    body: JSON.stringify({ records: [{ student_id: student.id, status: "present" }], close: true }),
  });
  assert.equal(attendanceSaved.response.status, 200, JSON.stringify(attendanceSaved.body));
  const studentAttendance = await api(`/student/classes/${fixture.classId}/attendance`, { headers: auth(studentToken) });
  assert.equal(studentAttendance.response.status, 200);
  assert.equal(studentAttendance.body.summary.percent, 100);

  const lesson = await api(`/teacher/classes/${fixture.classId}/lessons`, {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ title: "E2E Live Lesson", meeting_url: "https://meet.example.com/e2e" }),
  });
  assert.equal(lesson.response.status, 201, JSON.stringify(lesson.body));
  const liveLesson = await api(`/student/classes/${fixture.classId}/live-lesson`, { headers: auth(studentToken) });
  assert.equal(liveLesson.response.status, 200);
  assert.equal(liveLesson.body.lesson.title, "E2E Live Lesson");
  const lessonFinished = await api(`/teacher/classes/${fixture.classId}/lessons/${lesson.body.lesson.id}/finish`, {
    method: "POST", headers: auth(teacherToken), body: "{}",
  });
  assert.equal(lessonFinished.response.status, 200, JSON.stringify(lessonFinished.body));

  const leftClass = await api(`/student/classes/${fixture.classId}/leave`, {
    method: "POST", headers: auth(studentToken), body: "{}",
  });
  assert.equal(leftClass.response.status, 200, JSON.stringify(leftClass.body));
  const classesAfterLeave = await api("/student/classes", { headers: auth(studentToken) });
  assert.equal(classesAfterLeave.response.status, 200);
  assert.equal(classesAfterLeave.body.classes.some((item) => Number(item.id) === fixture.classId), false);

  const statesResponse = await api("/locations/states?country=UZ");
  assert.equal(statesResponse.response.status, 200);
  const registrationState = statesResponse.body.states[0];
  const citiesResponse = await api(`/locations/cities?country=UZ&state=${encodeURIComponent(registrationState.code)}`);
  assert.equal(citiesResponse.response.status, 200);
  const registrationDistrict = citiesResponse.body.cities[0] || null;
  const roleOtp = "654321";
  const roleOtpHash = await bcrypt.hash(roleOtp, 6);

  async function registerRole(role, phonePrefix, usernamePrefix) {
    const phone = phonePrefix + suffix;
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,$2,NOW()+INTERVAL '10 minutes')",
      [phone, roleOtpHash]
    );
    const result = await api("/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: "E2E", last_name: role === "parent" ? "Parent" : "Teacher",
        phone, password, code: roleOtp, role, username: usernamePrefix + suffix,
        country: "UZ", region: role === "parent" ? null : registrationState.name,
        district: role === "parent" ? null : registrationDistrict,
        school: role === "parent" ? null : "42-maktab",
      }),
    });
    if (result.response.status === 201) fixture.userIds.push(result.body.user.id);
    return result;
  }

  const teacherRegistration = await registerRole("teacher", "+99895", "e2e_role_teacher_");
  assert.equal(teacherRegistration.response.status, 201, JSON.stringify(teacherRegistration.body));
  assert.equal(teacherRegistration.body.user.role, "teacher");
  const parentRegistration = await registerRole("parent", "+99896", "e2e_role_parent_");
  assert.equal(parentRegistration.response.status, 201, JSON.stringify(parentRegistration.body));
  assert.equal(parentRegistration.body.user.role, "parent");

  const passwordChanged = await api("/teacher/settings/password", {
    method: "POST", headers: auth(teacherToken),
    body: JSON.stringify({ current_password: password, new_password: changedPassword }),
  });
  assert.equal(passwordChanged.response.status, 200, JSON.stringify(passwordChanged.body));
  const revoked = await api("/teacher/settings/profile", { headers: auth(teacherToken) });
  assert.equal(revoked.response.status, 401);

  const relogin = await api("/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: teacherPhone, password: changedPassword }),
  });
  assert.equal(relogin.response.status, 200);
  teacherToken = relogin.body.token;

  const logout = await api("/logout", { method: "POST", headers: auth(studentToken), body: "{}" });
  assert.equal(logout.response.status, 200);
  const revokedStudent = await api("/student/classes", { headers: auth(studentToken) });
  assert.equal(revokedStudent.response.status, 401);
});
