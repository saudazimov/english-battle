BEGIN;

WITH seeds(parent_slug, node_type, name, slug) AS (
  VALUES
    ('present-simple', 'subskill', 'Forms of be', 'forms-of-be'),
    ('verb-forms-and-tenses', 'subskill', 'Past Simple affirmative', 'past-simple-affirmative')
)
INSERT INTO learning_taxonomy (node_type, parent_id, name, slug)
SELECT seeds.node_type, parent.id, seeds.name, seeds.slug
FROM seeds
JOIN learning_taxonomy parent
  ON parent.slug=seeds.parent_slug AND parent.node_type='topic'
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_taxonomy existing
  WHERE existing.parent_id=parent.id AND existing.slug=seeds.slug
);

WITH seeds(parent_slug, node_type, name, slug) AS (
  VALUES
    ('forms-of-be', 'micro_skill', 'Using am with I', 'using-am-with-i'),
    ('forms-of-be', 'micro_skill', 'Using are with we, you, and they', 'using-are-with-we-you-they'),
    ('forms-of-be', 'micro_skill', 'Affirmative word order with be', 'affirmative-word-order-with-be'),
    ('past-simple-affirmative', 'micro_skill', 'Regular verbs: add -ed', 'regular-verbs-add-ed')
)
INSERT INTO learning_taxonomy (node_type, parent_id, name, slug)
SELECT seeds.node_type, parent.id, seeds.name, seeds.slug
FROM seeds
JOIN learning_taxonomy parent
  ON parent.slug=seeds.parent_slug AND parent.node_type='subskill'
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_taxonomy existing
  WHERE existing.parent_id=parent.id AND existing.slug=seeds.slug
);

WITH desired(question_id, topic_slug, subskill_slug, micro_skill_slug) AS (
  VALUES
    (9, 'present-simple', 'forms-of-be', 'using-are-with-we-you-they'),
    (13, 'present-simple', 'forms-of-be', 'using-am-with-i'),
    (40, 'present-simple', 'forms-of-be', 'using-are-with-we-you-they'),
    (391, 'verb-forms-and-tenses', 'past-simple-affirmative', 'regular-verbs-add-ed'),
    (392, 'present-simple', 'forms-of-be', 'affirmative-word-order-with-be')
), resolved AS (
  SELECT desired.question_id,
         main.id AS main_skill_id,
         topic.id AS topic_id,
         subskill.id AS subskill_id,
         micro.id AS micro_skill_id
  FROM desired
  JOIN learning_taxonomy topic
    ON topic.slug=desired.topic_slug AND topic.node_type='topic'
  JOIN learning_taxonomy main
    ON main.id=topic.parent_id AND main.slug='grammar' AND main.node_type='main_skill'
  JOIN learning_taxonomy subskill
    ON subskill.parent_id=topic.id
   AND subskill.slug=desired.subskill_slug
   AND subskill.node_type='subskill'
  JOIN learning_taxonomy micro
    ON micro.parent_id=subskill.id
   AND micro.slug=desired.micro_skill_slug
   AND micro.node_type='micro_skill'
), changed AS (
  SELECT analysis.question_id,
         analysis.main_skill_id AS old_main_skill_id,
         analysis.topic_id AS old_topic_id,
         analysis.subskill_id AS old_subskill_id,
         analysis.micro_skill_id AS old_micro_skill_id,
         resolved.main_skill_id,
         resolved.topic_id,
         resolved.subskill_id,
         resolved.micro_skill_id
  FROM question_ai_analysis analysis
  JOIN resolved ON resolved.question_id=analysis.question_id
  WHERE analysis.main_skill_id IS DISTINCT FROM resolved.main_skill_id
     OR analysis.topic_id IS DISTINCT FROM resolved.topic_id
     OR analysis.subskill_id IS DISTINCT FROM resolved.subskill_id
     OR analysis.micro_skill_id IS DISTINCT FROM resolved.micro_skill_id
)
INSERT INTO question_analysis_overrides (
  question_id, field_name, original_value, override_value, reason, override_author
)
SELECT changed.question_id,
       'taxonomy_mapping',
       jsonb_build_object(
         'main_skill_id', changed.old_main_skill_id,
         'topic_id', changed.old_topic_id,
         'subskill_id', changed.old_subskill_id,
         'micro_skill_id', changed.old_micro_skill_id
       ),
       jsonb_build_object(
         'main_skill_id', changed.main_skill_id,
         'topic_id', changed.topic_id,
         'subskill_id', changed.subskill_id,
         'micro_skill_id', changed.micro_skill_id
       ),
       'Taxonomy semantic audit: precise grammar hierarchy assigned',
       'System taxonomy semantic audit'
FROM changed;

WITH desired(question_id, topic_slug, subskill_slug, micro_skill_slug) AS (
  VALUES
    (9, 'present-simple', 'forms-of-be', 'using-are-with-we-you-they'),
    (13, 'present-simple', 'forms-of-be', 'using-am-with-i'),
    (40, 'present-simple', 'forms-of-be', 'using-are-with-we-you-they'),
    (391, 'verb-forms-and-tenses', 'past-simple-affirmative', 'regular-verbs-add-ed'),
    (392, 'present-simple', 'forms-of-be', 'affirmative-word-order-with-be')
), resolved AS (
  SELECT desired.question_id,
         main.id AS main_skill_id,
         topic.id AS topic_id,
         subskill.id AS subskill_id,
         micro.id AS micro_skill_id
  FROM desired
  JOIN learning_taxonomy topic
    ON topic.slug=desired.topic_slug AND topic.node_type='topic'
  JOIN learning_taxonomy main
    ON main.id=topic.parent_id AND main.slug='grammar' AND main.node_type='main_skill'
  JOIN learning_taxonomy subskill
    ON subskill.parent_id=topic.id
   AND subskill.slug=desired.subskill_slug
   AND subskill.node_type='subskill'
  JOIN learning_taxonomy micro
    ON micro.parent_id=subskill.id
   AND micro.slug=desired.micro_skill_slug
   AND micro.node_type='micro_skill'
)
UPDATE question_ai_analysis analysis
SET main_skill_id=resolved.main_skill_id,
    topic_id=resolved.topic_id,
    subskill_id=resolved.subskill_id,
    micro_skill_id=resolved.micro_skill_id,
    updated_at=NOW()
FROM resolved
WHERE analysis.question_id=resolved.question_id
  AND (
    analysis.main_skill_id IS DISTINCT FROM resolved.main_skill_id
    OR analysis.topic_id IS DISTINCT FROM resolved.topic_id
    OR analysis.subskill_id IS DISTINCT FROM resolved.subskill_id
    OR analysis.micro_skill_id IS DISTINCT FROM resolved.micro_skill_id
  );

DO $$
DECLARE
  mapped_count INTEGER;
BEGIN
  WITH desired(question_id, topic_slug, subskill_slug, micro_skill_slug) AS (
    VALUES
      (9, 'present-simple', 'forms-of-be', 'using-are-with-we-you-they'),
      (13, 'present-simple', 'forms-of-be', 'using-am-with-i'),
      (40, 'present-simple', 'forms-of-be', 'using-are-with-we-you-they'),
      (391, 'verb-forms-and-tenses', 'past-simple-affirmative', 'regular-verbs-add-ed'),
      (392, 'present-simple', 'forms-of-be', 'affirmative-word-order-with-be')
  )
  SELECT COUNT(*)
  INTO mapped_count
  FROM desired
  JOIN learning_taxonomy topic
    ON topic.slug=desired.topic_slug AND topic.node_type='topic'
  JOIN learning_taxonomy subskill
    ON subskill.parent_id=topic.id
   AND subskill.slug=desired.subskill_slug
   AND subskill.node_type='subskill'
  JOIN learning_taxonomy micro
    ON micro.parent_id=subskill.id
   AND micro.slug=desired.micro_skill_slug
   AND micro.node_type='micro_skill'
  JOIN question_ai_analysis analysis
    ON analysis.question_id=desired.question_id
   AND analysis.topic_id=topic.id
   AND analysis.subskill_id=subskill.id
   AND analysis.micro_skill_id=micro.id;

  IF mapped_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 precise taxonomy mappings, found %', mapped_count;
  END IF;
END $$;

COMMIT;
