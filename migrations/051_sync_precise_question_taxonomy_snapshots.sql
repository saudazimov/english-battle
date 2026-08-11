BEGIN;

WITH desired AS (
  SELECT analysis.question_id,
         analysis.main_skill_id,
         analysis.topic_id,
         analysis.subskill_id,
         analysis.micro_skill_id
  FROM question_ai_analysis analysis
  JOIN questions question ON question.id=analysis.question_id
  WHERE (question.question_text, question.option_a, question.option_b,
         question.option_c, question.option_d, question.correct_option) IN (
    ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
    ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
    ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
    ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
    ('Choose the grammatically correct sentence.',
     'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
  )
    AND analysis.main_skill_id IS NOT NULL
    AND analysis.topic_id IS NOT NULL
    AND analysis.subskill_id IS NOT NULL
    AND analysis.micro_skill_id IS NOT NULL
), current_state AS (
  SELECT desired.*,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'taxonomy_id', tag.taxonomy_id,
             'tag_role', tag.tag_role,
             'confidence', tag.confidence,
             'source', tag.source
           ) ORDER BY tag.tag_role,tag.taxonomy_id)
           FROM question_taxonomy_tags tag
           WHERE tag.question_id=desired.question_id
             AND tag.tag_role IN ('main_skill','topic','subskill','micro_skill')
         ), '[]'::jsonb) AS original_tags,
         COALESCE((
           SELECT jsonb_agg(DISTINCT jsonb_build_object(
             'main_skill_id', event.main_skill_id,
             'topic_id', event.topic_id,
             'subskill_id', event.subskill_id,
             'micro_skill_id', event.micro_skill_id
           ))
           FROM student_answer_events event
           WHERE event.question_id=desired.question_id
         ), '[]'::jsonb) AS original_event_taxonomies,
         (SELECT COUNT(*)::int
          FROM student_answer_events event
          WHERE event.question_id=desired.question_id) AS event_count
  FROM desired
), changed AS (
  SELECT current_state.*
  FROM current_state
  WHERE EXISTS (
    SELECT 1
    FROM question_taxonomy_tags tag
    WHERE tag.question_id=current_state.question_id
      AND tag.tag_role IN ('main_skill','topic','subskill','micro_skill')
      AND NOT (
        (tag.tag_role='main_skill' AND tag.taxonomy_id=current_state.main_skill_id)
        OR (tag.tag_role='topic' AND tag.taxonomy_id=current_state.topic_id)
        OR (tag.tag_role='subskill' AND tag.taxonomy_id=current_state.subskill_id)
        OR (tag.tag_role='micro_skill' AND tag.taxonomy_id=current_state.micro_skill_id)
      )
  )
  OR NOT EXISTS (
    SELECT 1 FROM question_taxonomy_tags tag
    WHERE tag.question_id=current_state.question_id
      AND tag.tag_role='main_skill' AND tag.taxonomy_id=current_state.main_skill_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM question_taxonomy_tags tag
    WHERE tag.question_id=current_state.question_id
      AND tag.tag_role='topic' AND tag.taxonomy_id=current_state.topic_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM question_taxonomy_tags tag
    WHERE tag.question_id=current_state.question_id
      AND tag.tag_role='subskill' AND tag.taxonomy_id=current_state.subskill_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM question_taxonomy_tags tag
    WHERE tag.question_id=current_state.question_id
      AND tag.tag_role='micro_skill' AND tag.taxonomy_id=current_state.micro_skill_id
  )
  OR EXISTS (
    SELECT 1
    FROM student_answer_events event
    WHERE event.question_id=current_state.question_id
      AND (
        event.main_skill_id IS DISTINCT FROM current_state.main_skill_id
        OR event.topic_id IS DISTINCT FROM current_state.topic_id
        OR event.subskill_id IS DISTINCT FROM current_state.subskill_id
        OR event.micro_skill_id IS DISTINCT FROM current_state.micro_skill_id
      )
  )
)
INSERT INTO question_analysis_overrides (
  question_id, field_name, original_value, override_value, reason, override_author
)
SELECT changed.question_id,
       'taxonomy_snapshot_sync',
       jsonb_build_object(
         'tags', changed.original_tags,
         'event_taxonomies', changed.original_event_taxonomies,
         'event_count', changed.event_count
       ),
       jsonb_build_object(
         'main_skill_id', changed.main_skill_id,
         'topic_id', changed.topic_id,
         'subskill_id', changed.subskill_id,
         'micro_skill_id', changed.micro_skill_id,
         'event_count', changed.event_count
       ),
       'Taxonomy semantic audit: question tags and answer-event snapshots synchronized',
       'System taxonomy semantic audit'
FROM changed;

DELETE FROM question_taxonomy_tags tag
USING questions question
WHERE tag.question_id=question.id
  AND (question.question_text, question.option_a, question.option_b,
       question.option_c, question.option_d, question.correct_option) IN (
    ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
    ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
    ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
    ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
    ('Choose the grammatically correct sentence.',
     'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
  )
  AND tag.tag_role IN ('main_skill','topic','subskill','micro_skill');

WITH desired AS (
  SELECT analysis.question_id,
         analysis.main_skill_id,
         analysis.topic_id,
         analysis.subskill_id,
         analysis.micro_skill_id
  FROM question_ai_analysis analysis
  JOIN questions question ON question.id=analysis.question_id
  WHERE (question.question_text, question.option_a, question.option_b,
         question.option_c, question.option_d, question.correct_option) IN (
    ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
    ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
    ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
    ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
    ('Choose the grammatically correct sentence.',
     'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
  )
), tags AS (
  SELECT question_id,main_skill_id AS taxonomy_id,'main_skill'::varchar AS tag_role FROM desired
  UNION ALL
  SELECT question_id,topic_id,'topic'::varchar FROM desired
  UNION ALL
  SELECT question_id,subskill_id,'subskill'::varchar FROM desired
  UNION ALL
  SELECT question_id,micro_skill_id,'micro_skill'::varchar FROM desired
)
INSERT INTO question_taxonomy_tags (question_id,taxonomy_id,tag_role,confidence,source)
SELECT question_id,taxonomy_id,tag_role,1,'admin'
FROM tags
WHERE taxonomy_id IS NOT NULL
ON CONFLICT (question_id,taxonomy_id,tag_role)
DO UPDATE SET confidence=EXCLUDED.confidence,source=EXCLUDED.source;

UPDATE student_answer_events event
SET main_skill_id=analysis.main_skill_id,
    topic_id=analysis.topic_id,
    subskill_id=analysis.subskill_id,
    micro_skill_id=analysis.micro_skill_id,
    updated_at=NOW()
FROM question_ai_analysis analysis
JOIN questions question ON question.id=analysis.question_id
WHERE event.question_id=analysis.question_id
  AND (question.question_text, question.option_a, question.option_b,
       question.option_c, question.option_d, question.correct_option) IN (
    ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
    ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
    ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
    ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
    ('Choose the grammatically correct sentence.',
     'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
  )
  AND (
    event.main_skill_id IS DISTINCT FROM analysis.main_skill_id
    OR event.topic_id IS DISTINCT FROM analysis.topic_id
    OR event.subskill_id IS DISTINCT FROM analysis.subskill_id
    OR event.micro_skill_id IS DISTINCT FROM analysis.micro_skill_id
  );

DO $$
DECLARE
  expected_question_count INTEGER;
  synchronized_question_count INTEGER;
  mismatched_event_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO expected_question_count
  FROM questions question
  WHERE (question.question_text, question.option_a, question.option_b,
         question.option_c, question.option_d, question.correct_option) IN (
    ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
    ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
    ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
    ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
    ('Choose the grammatically correct sentence.',
     'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
  );

  WITH desired AS (
    SELECT analysis.question_id,
           analysis.main_skill_id,
           analysis.topic_id,
           analysis.subskill_id,
           analysis.micro_skill_id
    FROM question_ai_analysis analysis
    JOIN questions question ON question.id=analysis.question_id
    WHERE (question.question_text, question.option_a, question.option_b,
           question.option_c, question.option_d, question.correct_option) IN (
      ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
      ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
      ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
      ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
      ('Choose the grammatically correct sentence.',
       'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
    )
  )
  SELECT COUNT(*)
  INTO synchronized_question_count
  FROM desired
  WHERE (SELECT COUNT(*) FROM question_taxonomy_tags tag
         WHERE tag.question_id=desired.question_id
           AND (
             (tag.tag_role='main_skill' AND tag.taxonomy_id=desired.main_skill_id)
             OR (tag.tag_role='topic' AND tag.taxonomy_id=desired.topic_id)
             OR (tag.tag_role='subskill' AND tag.taxonomy_id=desired.subskill_id)
             OR (tag.tag_role='micro_skill' AND tag.taxonomy_id=desired.micro_skill_id)
           ))=4
    AND NOT EXISTS (
      SELECT 1 FROM question_taxonomy_tags tag
      WHERE tag.question_id=desired.question_id
        AND tag.tag_role IN ('main_skill','topic','subskill','micro_skill')
        AND NOT (
          (tag.tag_role='main_skill' AND tag.taxonomy_id=desired.main_skill_id)
          OR (tag.tag_role='topic' AND tag.taxonomy_id=desired.topic_id)
          OR (tag.tag_role='subskill' AND tag.taxonomy_id=desired.subskill_id)
          OR (tag.tag_role='micro_skill' AND tag.taxonomy_id=desired.micro_skill_id)
        )
    );

  SELECT COUNT(*)
  INTO mismatched_event_count
  FROM student_answer_events event
  JOIN question_ai_analysis analysis ON analysis.question_id=event.question_id
  JOIN questions question ON question.id=event.question_id
  WHERE (question.question_text, question.option_a, question.option_b,
         question.option_c, question.option_d, question.correct_option) IN (
    ('We ___ happy today.', 'is', 'am', 'are', 'be', 'C'),
    ('I ___ from Uzbekistan.', 'am', 'is', 'are', 'be', 'A'),
    ('They ___ students.', 'is', 'am', 'are', 'be', 'C'),
    ('Yesterday we ___ a new topic.', 'learned', 'learn', 'learns', 'learning', 'A'),
    ('Choose the grammatically correct sentence.',
     'They are ready.', 'They is ready.', 'They ready are.', 'They be ready.', 'A')
  )
    AND (
      event.main_skill_id IS DISTINCT FROM analysis.main_skill_id
      OR event.topic_id IS DISTINCT FROM analysis.topic_id
      OR event.subskill_id IS DISTINCT FROM analysis.subskill_id
      OR event.micro_skill_id IS DISTINCT FROM analysis.micro_skill_id
    );

  IF synchronized_question_count <> expected_question_count THEN
    RAISE EXCEPTION 'Expected % synchronized question taxonomy tag sets, found %',
      expected_question_count, synchronized_question_count;
  END IF;

  IF mismatched_event_count <> 0 THEN
    RAISE EXCEPTION 'Expected no stale answer-event taxonomy snapshots, found %',
      mismatched_event_count;
  END IF;
END $$;

COMMIT;
