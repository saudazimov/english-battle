const test = require("node:test");
const assert = require("node:assert/strict");

async function createSourceFixture(client) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const phone = `+999${Date.now().toString().slice(-10)}${String(Math.floor(Math.random() * 10000)).padStart(4,"0")}`;
  const slug = `db-integration-${suffix}`;
  const marker = `DB integration ${suffix}`;
  const student = await client.query(
    `INSERT INTO users (first_name,last_name,phone,password,role,cefr_level)
     VALUES ('DB Integration','Student',$1,'not-used','student','A1') RETURNING id`, [phone]
  );
  const taxonomy = await client.query(
    `INSERT INTO learning_taxonomy (node_type,name,slug,legacy_skill)
     VALUES ('micro_skill',$1,$2,'grammar') RETURNING id`, [marker,slug]
  );
  await client.query(
    `INSERT INTO student_skill_profiles (student_id,taxonomy_id,taxonomy_level)
     VALUES ($1,$2,'micro_skill')`, [student.rows[0].id,taxonomy.rows[0].id]
  );
  const plan = await client.query(
    `INSERT INTO remediation_plans (student_id,taxonomy_id,status,evidence_snapshot)
     VALUES ($1,$2,'RETEST_PENDING',$3::jsonb) RETURNING id`,
    [student.rows[0].id,taxonomy.rows[0].id,JSON.stringify({ integration_fixture: suffix })]
  );
  const sourceIds = [];
  for (let index = 1; index <= 10; index++) {
    const question = await client.query(
      `INSERT INTO questions
         (question_text,option_a,option_b,option_c,option_d,correct_option,cefr_level,skill,explanation)
       VALUES ($1,'A','B','C','D','A','A1','grammar','Integration fixture') RETURNING id`,
      [`${marker} question ${index}`]
    );
    sourceIds.push(question.rows[0].id);
  }
  return {
    suffix,phone,slug,marker,sourceIds,sequenceNo: 1,
    studentId: student.rows[0].id,taxonomyId: taxonomy.rows[0].id,planId: plan.rows[0].id,
  };
}

async function upsertAssessment(client, fixture) {
  return client.query(
    `INSERT INTO targeted_retests
       (remediation_plan_id,student_id,taxonomy_id,assessment_type,sequence_no,schema_version,status,
        quality_status,quality_warnings,scheduled_for,question_count,required_correct)
     VALUES ($1,$2,$3,'RETEST',$4,'targeted_retest_v1','READY','APPROVED','[]'::jsonb,NOW(),10,8)
     ON CONFLICT (remediation_plan_id,assessment_type,sequence_no) DO UPDATE SET updated_at=NOW()
     RETURNING id`,
    [fixture.planId,fixture.studentId,fixture.taxonomyId,fixture.sequenceNo]
  );
}

async function insertQuestion(client, assessmentId, sourceId, position) {
  return client.query(
    `INSERT INTO targeted_retest_questions
       (targeted_retest_id,source_question_id,position,question_format,prompt,options,correct_option,explanation)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'A','Integration fixture') ON CONFLICT DO NOTHING`,
    [assessmentId,sourceId,position,position % 2 ? "multiple_choice" : "gap_fill",
      `Integration recovery question ${position}`,JSON.stringify(["A","B","C","D"])]
  );
}

test("PostgreSQL rollback and retry preserve one assessment with ten unique questions", {
  skip: process.env.RUN_DB_INTEGRATION !== "true",
}, async () => {
  const pool = require("../db");
  const client = await pool.connect();
  let transactionOpen = false;
  let fixture;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    fixture = await createSourceFixture(client);
    await client.query("SAVEPOINT interrupted_attempt");
    const interrupted = await upsertAssessment(client,fixture);
    for (let index = 0; index < 5; index++) {
      await insertQuestion(client,interrupted.rows[0].id,fixture.sourceIds[index],index + 1);
    }
    await client.query("ROLLBACK TO SAVEPOINT interrupted_attempt");
    await client.query("RELEASE SAVEPOINT interrupted_attempt");
    const afterRollback = await client.query(
      `SELECT COUNT(*)::int AS count FROM targeted_retests
       WHERE remediation_plan_id=$1 AND assessment_type='RETEST' AND sequence_no=$2`,
      [fixture.planId,fixture.sequenceNo]
    );
    assert.equal(afterRollback.rows[0].count,0);

    const first = await upsertAssessment(client,fixture);
    const retry = await upsertAssessment(client,fixture);
    assert.equal(retry.rows[0].id,first.rows[0].id);
    for (let pass = 0; pass < 2; pass++) {
      for (let index = 0; index < fixture.sourceIds.length; index++) {
        await insertQuestion(client,first.rows[0].id,fixture.sourceIds[index],index + 1);
      }
    }
    const saved = await client.query(
      `SELECT COUNT(*)::int AS total,COUNT(DISTINCT source_question_id)::int AS sources,
              COUNT(DISTINCT position)::int AS positions
       FROM targeted_retest_questions WHERE targeted_retest_id=$1`,
      [first.rows[0].id]
    );
    assert.deepEqual(saved.rows[0],{ total: 10,sources: 10,positions: 10 });
    await client.query("ROLLBACK");
    transactionOpen = false;
    const final = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE phone=$1) AS students,
         (SELECT COUNT(*)::int FROM learning_taxonomy WHERE slug=$2) AS taxonomies,
         (SELECT COUNT(*)::int FROM questions WHERE question_text LIKE $3) AS questions,
         (SELECT COUNT(*)::int FROM remediation_plans
            WHERE evidence_snapshot->>'integration_fixture'=$4) AS plans`,
      [fixture.phone,fixture.slug,`${fixture.marker}%`,fixture.suffix]
    );
    assert.deepEqual(final.rows[0],{ students: 0,taxonomies: 0,questions: 0,plans: 0 });
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
});
