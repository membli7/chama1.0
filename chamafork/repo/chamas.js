"use strict";

const { recordId, toStoredData } = require("./identity");

async function listDirectory(client) {
  const result = await client.query(
    `SELECT tenant_id AS chama_id, source_id, display_name AS name,
            '{}'::jsonb AS record_data, '{}'::jsonb AS state_data, record_order
     FROM app_chama_directory ORDER BY record_order, tenant_id`,
  );
  return result.rows;
}

function row(chama, state, order, tenantId) {
  return {
    chama_id: tenantId || recordId("chama", "", chama.id),
    source_id: String(chama.id),
    name: String(chama.name || "Chama"),
    settings: toStoredData(state.settings || {}),
    state_data: toStoredData({
      idempotency: state.idempotency || {},
      welfareReserve: state.welfareReserve || 0,
      supportTickets: state.supportTickets || [],
      supportAgents: state.supportAgents || [],
      faqs: state.faqs || [],
      faqFeedback: state.faqFeedback || [],
    }),
    record_data: toStoredData(chama),
    record_order: order,
  };
}

async function save(client, chama, state, order, tenantId) {
  const value = row(chama, state, order, tenantId);
  await client.query(
    `INSERT INTO chamas (chama_id, source_id, name, settings, state_data, record_data, record_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (chama_id) DO UPDATE SET source_id = EXCLUDED.source_id, name = EXCLUDED.name,
       settings = EXCLUDED.settings, state_data = EXCLUDED.state_data,
       record_data = EXCLUDED.record_data, record_order = EXCLUDED.record_order`,
    [value.chama_id, value.source_id, value.name, value.settings, value.state_data, value.record_data, value.record_order],
  );
  await client.query(
    `INSERT INTO app_chama_directory (tenant_id, source_id, display_name, record_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE SET source_id = EXCLUDED.source_id,
       display_name = EXCLUDED.display_name, record_order = EXCLUDED.record_order`,
    [value.chama_id, value.source_id, value.name, value.record_order],
  );
  return value.chama_id;
}

async function remove(client, chamaId) {
  await client.query("DELETE FROM app_chama_directory WHERE tenant_id = $1", [chamaId]);
  await client.query("DELETE FROM chamas WHERE chama_id = $1", [chamaId]);
}

module.exports = { listDirectory, row, save, remove };
