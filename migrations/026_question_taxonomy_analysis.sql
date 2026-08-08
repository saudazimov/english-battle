-- Phase 3: database-driven learning taxonomy and durable question analysis.

CREATE TABLE IF NOT EXISTS learning_taxonomy (
  id BIGSERIAL PRIMARY KEY,
  node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('main_skill', 'topic', 'subskill', 'micro_skill')),
  parent_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  legacy_skill VARCHAR(50),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_taxonomy_parent_slug
  ON learning_taxonomy (COALESCE(parent_id, 0), slug);
CREATE INDEX IF NOT EXISTS idx_learning_taxonomy_parent
  ON learning_taxonomy(parent_id, node_type) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS idx_learning_taxonomy_legacy
  ON learning_taxonomy(legacy_skill) WHERE legacy_skill IS NOT NULL AND is_active=true;

CREATE TABLE IF NOT EXISTS taxonomy_prerequisites (
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  prerequisite_taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  importance NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (importance > 0 AND importance <= 1),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (taxonomy_id, prerequisite_taxonomy_id),
  CHECK (taxonomy_id <> prerequisite_taxonomy_id)
);

CREATE TABLE IF NOT EXISTS taxonomy_suggestions (
  id BIGSERIAL PRIMARY KEY,
  question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  suggested_node_type VARCHAR(20) NOT NULL,
  suggested_name VARCHAR(160) NOT NULL,
  suggested_parent_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  reason TEXT,
  confidence NUMERIC(5,4),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(120),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_suggestions_review
  ON taxonomy_suggestions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS question_ai_analysis (
  id BIGSERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  schema_version VARCHAR(50) NOT NULL DEFAULT 'question_analysis_v1',
  prompt_version VARCHAR(50) NOT NULL DEFAULT 'question_analysis_prompt_v1',
  analysis_version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'ANALYSIS_PENDING'
    CHECK (status IN ('ANALYSIS_PENDING','ANALYZING','READY','REVIEW_SUGGESTED','REVIEW_REQUIRED','ANALYSIS_FAILED','DISABLED')),
  estimated_level VARCHAR(10),
  level_confidence NUMERIC(5,4),
  level_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  main_skill_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  topic_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  subskill_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  micro_skill_id BIGINT REFERENCES learning_taxonomy(id) ON DELETE SET NULL,
  taxonomy_confidence NUMERIC(5,4),
  question_type VARCHAR(80),
  cognitive_task VARCHAR(120),
  grammar_structure TEXT,
  required_vocabulary JSONB NOT NULL DEFAULT '[]'::jsonb,
  prerequisite_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_explanation TEXT,
  quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  diagnostic_eligible BOOLEAN NOT NULL DEFAULT false,
  contains_above_level_language BOOLEAN NOT NULL DEFAULT false,
  analysis_confidence NUMERIC(5,4),
  provider VARCHAR(40),
  model VARCHAR(100),
  raw_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_question_ai_analysis_status
  ON question_ai_analysis(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_question_ai_analysis_taxonomy
  ON question_ai_analysis(main_skill_id, topic_id, subskill_id, micro_skill_id);

CREATE TABLE IF NOT EXISTS question_taxonomy_tags (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES learning_taxonomy(id) ON DELETE CASCADE,
  tag_role VARCHAR(20) NOT NULL CHECK (tag_role IN ('main_skill','topic','subskill','micro_skill','prerequisite')),
  confidence NUMERIC(5,4),
  source VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','fallback','admin')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, taxonomy_id, tag_role)
);
CREATE INDEX IF NOT EXISTS idx_question_taxonomy_tags_taxonomy
  ON question_taxonomy_tags(taxonomy_id, question_id);

CREATE TABLE IF NOT EXISTS question_distractor_analysis (
  id BIGSERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_code VARCHAR(10) NOT NULL,
  error_code VARCHAR(100) NOT NULL,
  likely_reason TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','fallback','admin')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, option_code)
);
CREATE INDEX IF NOT EXISTS idx_question_distractor_error
  ON question_distractor_analysis(error_code, question_id);

CREATE TABLE IF NOT EXISTS question_analysis_overrides (
  id BIGSERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  field_name VARCHAR(80) NOT NULL,
  original_value JSONB,
  override_value JSONB,
  reason TEXT,
  override_author VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_question_analysis_overrides_question
  ON question_analysis_overrides(question_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  run_after TIMESTAMP NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMP,
  completed_at TIMESTAMP,
  last_error TEXT,
  idempotency_key VARCHAR(300) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_ready
  ON ai_generation_jobs(job_type, status, run_after, created_at);

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(30) NOT NULL DEFAULT 'ANALYSIS_PENDING',
  ADD COLUMN IF NOT EXISTS diagnostic_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analysis_version INTEGER;

-- Minimal stable seed. AI can only select these active IDs; unknown concepts go to suggestions.
INSERT INTO learning_taxonomy (node_type, name, slug, legacy_skill)
SELECT v.node_type, v.name, v.slug, v.legacy_skill
FROM (VALUES
  ('main_skill','Grammar','grammar','grammar'),
  ('main_skill','Vocabulary','vocabulary','vocabulary'),
  ('main_skill','Reading','reading','reading'),
  ('main_skill','Listening','listening','listening'),
  ('main_skill','Writing','writing','writing'),
  ('main_skill','Speaking','speaking','speaking')
) AS v(node_type, name, slug, legacy_skill)
WHERE NOT EXISTS (
  SELECT 1 FROM learning_taxonomy t WHERE t.parent_id IS NULL AND t.slug=v.slug
);

WITH seeds(parent_slug, node_type, name, slug) AS (
  VALUES
    ('grammar','topic','Present Simple','present-simple'),
    ('grammar','topic','Verb forms and tenses','verb-forms-and-tenses'),
    ('grammar','topic','General grammar','general-grammar'),
    ('vocabulary','topic','Vocabulary in context','vocabulary-in-context'),
    ('reading','topic','Reading comprehension','reading-comprehension'),
    ('listening','topic','Listening comprehension','listening-comprehension'),
    ('writing','topic','Written production','written-production'),
    ('speaking','topic','Spoken production','spoken-production')
)
INSERT INTO learning_taxonomy (node_type, parent_id, name, slug)
SELECT s.node_type, p.id, s.name, s.slug
FROM seeds s JOIN learning_taxonomy p ON p.parent_id IS NULL AND p.slug=s.parent_slug
WHERE NOT EXISTS (
  SELECT 1 FROM learning_taxonomy t WHERE t.parent_id=p.id AND t.slug=s.slug
);

WITH seeds(parent_slug, node_type, name, slug) AS (
  VALUES
    ('present-simple','subskill','Third-person singular','third-person-singular'),
    ('verb-forms-and-tenses','subskill','Selecting the correct tense','selecting-correct-tense'),
    ('general-grammar','subskill','Applying grammar rules','applying-grammar-rules'),
    ('vocabulary-in-context','subskill','Inferring word meaning','inferring-word-meaning'),
    ('reading-comprehension','subskill','Understanding paraphrase','understanding-paraphrase'),
    ('listening-comprehension','subskill','Understanding spoken detail','spoken-detail'),
    ('written-production','subskill','Sentence construction','sentence-construction'),
    ('spoken-production','subskill','Accurate spoken response','spoken-response')
)
INSERT INTO learning_taxonomy (node_type, parent_id, name, slug)
SELECT s.node_type, p.id, s.name, s.slug
FROM seeds s JOIN learning_taxonomy p ON p.slug=s.parent_slug AND p.node_type='topic'
WHERE NOT EXISTS (
  SELECT 1 FROM learning_taxonomy t WHERE t.parent_id=p.id AND t.slug=s.slug
);

WITH parent AS (
  SELECT id FROM learning_taxonomy WHERE slug='third-person-singular' AND node_type='subskill' LIMIT 1
)
INSERT INTO learning_taxonomy (node_type, parent_id, name, slug)
SELECT 'micro_skill', parent.id, 'Selecting -s, -es, or -ies', 'selecting-s-es-ies'
FROM parent
WHERE NOT EXISTS (
  SELECT 1 FROM learning_taxonomy t WHERE t.parent_id=parent.id AND t.slug='selecting-s-es-ies'
);

INSERT INTO question_ai_analysis (question_id, status)
SELECT q.id, 'ANALYSIS_PENDING' FROM questions q
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO ai_generation_jobs (
  job_type, entity_type, entity_id, payload, idempotency_key
)
SELECT
  'question_analysis', 'question', q.id::text,
  jsonb_build_object('question_id', q.id, 'reason', 'phase3_backfill'),
  'question-analysis:' || q.id::text || ':' || EXTRACT(EPOCH FROM q.updated_at)::bigint::text
FROM questions q
ON CONFLICT (idempotency_key) DO NOTHING;
