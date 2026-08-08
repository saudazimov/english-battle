-- question_analysis_v1 supports "Pre-A1" (6 characters); legacy columns used VARCHAR(5).
ALTER TABLE users ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE questions ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE battle_history ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE assignments ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE assignment_questions ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE exam_attempts ALTER COLUMN from_level TYPE VARCHAR(10);
ALTER TABLE exam_attempts ALTER COLUMN to_level TYPE VARCHAR(10);
ALTER TABLE teacher_exams ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE teacher_exam_questions ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE teacher_resources ALTER COLUMN cefr_level TYPE VARCHAR(10);
ALTER TABLE practice_sessions ALTER COLUMN level TYPE VARCHAR(10);
ALTER TABLE exam_sessions ALTER COLUMN from_level TYPE VARCHAR(10);
ALTER TABLE battle_sessions ALTER COLUMN cefr_level TYPE VARCHAR(10);
