-- Tournament battles use a separate source table but belong to battle evidence.
INSERT INTO student_answer_events (
  student_id, question_id, source_mode, source_record_id, source_question_id,
  selected_option, correct_option, is_correct, timed_out, attempt_number,
  detected_cefr_level, legacy_skill, answered_at, event_metadata, idempotency_key
)
SELECT
  ta.user_id, ta.question_id, 'battle', 'tournament:' || ta.match_id, ta.question_id,
  UPPER(ta.answer), q.correct_option, ta.is_correct, false, 1,
  q.cefr_level, q.skill, COALESCE(ta.created_at, NOW()),
  jsonb_build_object('battle_type', 'tournament', 'tournament_match_id', ta.match_id),
  'battle:' || ta.user_id || ':tournament:' || ta.match_id || ':' || ta.question_id || ':1'
FROM tournament_match_answers ta
LEFT JOIN questions q ON q.id = ta.question_id
ON CONFLICT (idempotency_key) DO NOTHING;
