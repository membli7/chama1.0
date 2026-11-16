-- 007_support_and_faq.sql
-- Human Support Agent and FAQ system schema

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL DEFAULT '',
  user_phone TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Waiting for User', 'Resolved', 'Closed')),
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_agent_name TEXT,
  escalated BOOLEAN NOT NULL DEFAULT false,
  escalated_to TEXT,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS support_tickets_chama_idx ON support_tickets (chama_id);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_agent_idx ON support_tickets (assigned_agent_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_role TEXT NOT NULL DEFAULT 'member',
  is_staff BOOLEAN NOT NULL DEFAULT false,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages (ticket_id);

CREATE TABLE IF NOT EXISTS support_agents (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  not_helpful_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faqs_category_idx ON faqs (category);
CREATE INDEX IF NOT EXISTS faqs_published_idx ON faqs (published);

CREATE TABLE IF NOT EXISTS faq_feedback (
  id UUID PRIMARY KEY,
  faq_id UUID NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('helpful', 'not_helpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (faq_id, user_id)
);
