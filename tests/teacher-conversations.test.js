const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherConversationsController,
} = require("../src/controllers/teacherConversationsController");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("teacher conversations preserves query, response and live online status", async () => {
  const rows = [
    { id: 1, first_name: "Ali", last_message: "Salom", unread_count: 1 },
    { id: 2, first_name: "Vali", last_message: null, unread_count: 0 },
  ];
  const queries = [];
  const onlineUsers = {};
  const controller = createTeacherConversationsController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows };
      },
    },
    onlineUsers,
  });
  onlineUsers["1"] = "socket-1";
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.deepEqual(queries, [{
    sql: `SELECT DISTINCT ON (u.id) u.id, u.first_name, u.last_name, u.profile_picture,
              u.cefr_level, c.name AS class_name,
              lm.message AS last_message, lm.created_at AS last_message_at,
              (SELECT COUNT(*)::int FROM teacher_messages tm
               WHERE tm.teacher_id=$1 AND tm.student_id=u.id
                 AND tm.sender_id=u.id AND tm.read_at IS NULL) AS unread_count
       FROM classes c
       JOIN class_students cs ON cs.class_id=c.id AND cs.status='active'
       JOIN users u ON u.id=cs.student_id
       LEFT JOIN LATERAL (
         SELECT message, created_at FROM teacher_messages tm
         WHERE tm.teacher_id=$1 AND tm.student_id=u.id
         ORDER BY tm.created_at DESC LIMIT 1
       ) lm ON TRUE
       WHERE c.teacher_id=$1 AND c.archived_at IS NULL
       ORDER BY u.id, lm.created_at DESC NULLS LAST`,
    params: [42],
  }]);
  assert.deepEqual(res.body, {
    conversations: [
      { ...rows[0], is_online: true },
      { ...rows[1], is_online: false },
    ],
  });
  assert.equal(rows[0].is_online, undefined);
});

test("teacher conversations preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherConversationsController({
    pool: { async query() { throw new Error("database unavailable"); } },
    onlineUsers: {},
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher conversations xatosi:", "database unavailable"]]);
});
