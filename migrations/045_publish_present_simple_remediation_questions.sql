-- Publish a reviewed A1 question set for the exact Present Simple rule used by remediation lessons.
-- This is an idempotent content migration; it does not change the database schema.

BEGIN;

CREATE TEMP TABLE present_simple_remediation_content (
  question_text TEXT PRIMARY KEY,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL,
  explanation TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO present_simple_remediation_content
  (question_text,option_a,option_b,option_c,option_d,correct_option,explanation)
VALUES
  ('My sister ___ English after class.','studies','study','studying','studied','A',
   'Study fe''li undosh + y bilan tugaydi. Uchinchi shaxs birlikda y harfi ies ga o''zgaradi: studies.'),
  ('The bus ___ at seven o''clock.','leaves','leave','leaving','left','A',
   'The bus uchinchi shaxs birlik hisoblanadi. Present Simple tasdiq gapida leave fe''liga -s qo''shiladi: leaves.'),
  ('She ___ her homework in the evening.','does','do','doing','did','A',
   'She uchinchi shaxs birlik. Do fe''lining Present Simple shakli -es qo''shimchasi bilan does bo''ladi.'),
  ('Ali ___ football on Fridays.','plays','play','playing','played','A',
   'Ali uchinchi shaxs birlik. Play unli + y bilan tugagani uchun faqat -s qo''shiladi: plays.'),
  ('The baby ___ when it is hungry.','cries','cry','crying','cried','A',
   'Cry undosh + y bilan tugaydi. Uchinchi shaxs birlikda y harfi ies ga o''zgaradi: cries.'),
  ('Our teacher ___ every answer.','checks','check','checking','checked','A',
   'Our teacher uchinchi shaxs birlik. Oddiy Present Simple tasdiq gapida check fe''liga -s qo''shiladi: checks.'),
  ('He ___ TV after dinner.','watches','watch','watching','watched','A',
   'Watch -ch bilan tugaydi. Uchinchi shaxs birlikda fe''lga -es qo''shiladi: watches.'),
  ('Madina ___ the dishes at home.','washes','wash','washing','washed','A',
   'Wash -sh bilan tugaydi. Uchinchi shaxs birlikda fe''lga -es qo''shiladi: washes.'),
  ('The shop ___ at nine in the morning.','opens','open','opening','opened','A',
   'The shop uchinchi shaxs birlik. Present Simple tasdiq gapida open fe''liga -s qo''shiladi: opens.'),
  ('My brother ___ a dictionary to class every day.','carries','carry','carrying','carried','A',
   'Carry fe''li undosh + y bilan tugaydi. Uchinchi shaxs birlikda y harfi ies ga o''zgaradi: carries.');

UPDATE questions q
SET option_a=c.option_a,option_b=c.option_b,option_c=c.option_c,option_d=c.option_d,
    correct_option=c.correct_option,cefr_level='A1',skill='grammar',difficulty='easy',
    explanation=c.explanation,status='published',analysis_status='READY',
    diagnostic_eligible=true,analysis_version=1,updated_at=NOW()
FROM present_simple_remediation_content c
WHERE q.status='draft'
  AND LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
      = LOWER(REGEXP_REPLACE(TRIM(c.question_text),'\s+',' ','g'));

INSERT INTO questions
  (question_text,option_a,option_b,option_c,option_d,correct_option,cefr_level,skill,
   difficulty,explanation,status,analysis_status,diagnostic_eligible,analysis_version)
SELECT c.question_text,c.option_a,c.option_b,c.option_c,c.option_d,c.correct_option,
       'A1','grammar','easy',c.explanation,'published','READY',true,1
FROM present_simple_remediation_content c
WHERE NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
        = LOWER(REGEXP_REPLACE(TRIM(c.question_text),'\s+',' ','g'))
);

UPDATE questions q
SET explanation='Go fe''li -o bilan tugaydi. Uchinchi shaxs birlikda fe''lga -es qo''shiladi: goes.',
    updated_at=NOW()
WHERE q.status='draft'
  AND LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))='he ___ to school every day.'
  AND q.explanation LIKE '[DEMO:learning-diagnostics-v1]%';

WITH taxonomy AS (
  SELECT micro.id AS micro_skill_id,subskill.id AS subskill_id,topic.id AS topic_id,main.id AS main_skill_id
  FROM learning_taxonomy micro
  JOIN learning_taxonomy subskill ON subskill.id=micro.parent_id
  JOIN learning_taxonomy topic ON topic.id=subskill.parent_id
  JOIN learning_taxonomy main ON main.id=topic.parent_id
  WHERE micro.slug='selecting-s-es-ies'
), canonical_questions AS (
  SELECT DISTINCT ON (c.question_text) q.id,c.explanation
  FROM present_simple_remediation_content c
  JOIN questions q
    ON LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
       = LOWER(REGEXP_REPLACE(TRIM(c.question_text),'\s+',' ','g'))
  WHERE q.status='published'
  ORDER BY c.question_text,q.id
)
INSERT INTO question_ai_analysis
  (question_id,schema_version,prompt_version,analysis_version,status,estimated_level,
   level_confidence,level_evidence,main_skill_id,topic_id,subskill_id,micro_skill_id,
   taxonomy_confidence,question_type,cognitive_task,grammar_structure,required_vocabulary,
   prerequisite_skill_ids,correct_answer_explanation,quality_warnings,diagnostic_eligible,
   contains_above_level_language,analysis_confidence,provider,model,raw_analysis,last_error,analyzed_at)
SELECT q.id,'question_analysis_v1','approved_content_v1',1,'READY','A1',0.98,
       '["Manually reviewed A1 grammar and vocabulary"]'::jsonb,
       t.main_skill_id,t.topic_id,t.subskill_id,t.micro_skill_id,0.99,
       'gap_fill','apply_rule_or_infer','Present Simple third-person singular',
       '[]'::jsonb,'[]'::jsonb,q.explanation,'[]'::jsonb,true,false,0.98,
       'approved-content','human-reviewed',
       '{"source":"migration_045","reviewed":true}'::jsonb,NULL,NOW()
FROM canonical_questions q CROSS JOIN taxonomy t
ON CONFLICT (question_id) DO UPDATE SET
  schema_version=EXCLUDED.schema_version,prompt_version=EXCLUDED.prompt_version,
  analysis_version=EXCLUDED.analysis_version,status=EXCLUDED.status,
  estimated_level=EXCLUDED.estimated_level,level_confidence=EXCLUDED.level_confidence,
  level_evidence=EXCLUDED.level_evidence,main_skill_id=EXCLUDED.main_skill_id,
  topic_id=EXCLUDED.topic_id,subskill_id=EXCLUDED.subskill_id,
  micro_skill_id=EXCLUDED.micro_skill_id,taxonomy_confidence=EXCLUDED.taxonomy_confidence,
  question_type=EXCLUDED.question_type,cognitive_task=EXCLUDED.cognitive_task,
  grammar_structure=EXCLUDED.grammar_structure,correct_answer_explanation=EXCLUDED.correct_answer_explanation,
  quality_warnings='[]'::jsonb,diagnostic_eligible=true,contains_above_level_language=false,
  analysis_confidence=EXCLUDED.analysis_confidence,provider=EXCLUDED.provider,model=EXCLUDED.model,
  raw_analysis=EXCLUDED.raw_analysis,last_error=NULL,analyzed_at=NOW(),updated_at=NOW();

WITH taxonomy AS (
  SELECT micro.id AS micro_skill_id,subskill.id AS subskill_id,topic.id AS topic_id,main.id AS main_skill_id
  FROM learning_taxonomy micro
  JOIN learning_taxonomy subskill ON subskill.id=micro.parent_id
  JOIN learning_taxonomy topic ON topic.id=subskill.parent_id
  JOIN learning_taxonomy main ON main.id=topic.parent_id
  WHERE micro.slug='selecting-s-es-ies'
), canonical_questions AS (
  SELECT DISTINCT ON (c.question_text) q.id
  FROM present_simple_remediation_content c
  JOIN questions q
    ON LOWER(REGEXP_REPLACE(TRIM(q.question_text),'\s+',' ','g'))
       = LOWER(REGEXP_REPLACE(TRIM(c.question_text),'\s+',' ','g'))
  WHERE q.status='published'
  ORDER BY c.question_text,q.id
), tags AS (
  SELECT q.id AS question_id,v.taxonomy_id,v.tag_role
  FROM canonical_questions q CROSS JOIN taxonomy t
  CROSS JOIN LATERAL (VALUES
    (t.main_skill_id,'main_skill'),(t.topic_id,'topic'),
    (t.subskill_id,'subskill'),(t.micro_skill_id,'micro_skill')
  ) v(taxonomy_id,tag_role)
)
INSERT INTO question_taxonomy_tags (question_id,taxonomy_id,tag_role,confidence,source)
SELECT question_id,taxonomy_id,tag_role,0.99,'admin' FROM tags
ON CONFLICT (question_id,taxonomy_id,tag_role) DO UPDATE SET confidence=0.99,source='admin';

DO $$
DECLARE approved_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT q.id) INTO approved_count
  FROM questions q
  JOIN question_taxonomy_tags qt ON qt.question_id=q.id
  JOIN learning_taxonomy t ON t.id=qt.taxonomy_id
  JOIN question_ai_analysis qa ON qa.question_id=q.id
  WHERE t.slug='selecting-s-es-ies' AND qt.tag_role='micro_skill'
    AND q.status='published' AND q.diagnostic_eligible=true AND qa.diagnostic_eligible=true
    AND q.cefr_level='A1';
  IF approved_count < 10 THEN
    RAISE EXCEPTION 'Selecting -s, -es, or -ies requires at least 10 published A1 diagnostic questions; found %', approved_count;
  END IF;
END $$;

COMMIT;
