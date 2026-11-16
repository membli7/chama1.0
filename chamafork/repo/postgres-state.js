"use strict";

const { withTenant } = require("../db/postgres");
const { stableId, recordId, cents, fromStoredData, toStoredData } = require("./identity");
const chamas = require("./chamas");
const users = require("./users");
const memberships = require("./memberships");
const contributions = require("./contributions");
const loans = require("./loans");
const loanRepayments = require("./loan-repayments");
const attendance = require("./attendance");
const transactions = require("./transactions");
const ledgerEntries = require("./ledger-entries");
const auditLog = require("./audit-log");
const messages = require("./messages");
const invitations = require("./invitations");
const dividends = require("./dividends");
const penalties = require("./penalties");
const mpesaCallbacks = require("./mpesa-callbacks");

const clearOrder = [
  mpesaCallbacks, ledgerEntries, loanRepayments, transactions, contributions,
  attendance.attendees, attendance.registers, auditLog, messages, invitations,
  dividends, penalties, memberships, loans,
];

function stateTemplate() {
  return {
    version: 2, chamas: [], users: [], transactions: [], loans: [], payouts: [],
    invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {},
    registers: [], auditLog: [], ledgerEntries: [], welfareReserve: 0, penalties: [],
    settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, meetingDates: {} }, dividendCycles: [], messages: [],
    supportTickets: [], supportAgents: [], faqs: [], faqFeedback: [],
  };
}

function invitationRow(invitation, order, tenantId, chamaId, userRef = source => source ? userDbId(chamaId, source) : null) {
  return {
    ...tenantBase("invitations", chamaId, tenantId, invitation, order), name: String(invitation.name || ""), phone: String(invitation.phone || ""),
    email: invitation.email || null, requested_role: String(invitation.requestedRole || "member"),
    status: invitation.usedAt ? "active" : "invited", code_hash: invitation.codeHash || null,
    invited_by: userRef(invitation.invitedBy), invited_at: dateTime(invitation.invitedAt),
    expires_at: invitation.expiresAt ? dateTime(invitation.expiresAt) : null, used_at: invitation.usedAt ? dateTime(invitation.usedAt) : null,
  };
}

function auditLogRow(record, kind, order, chamaId, tenantId, userRef = source => source ? userDbId(chamaId, source) : null) {
  const data = { ...record };
  delete data._recordKind;
  // recordFromRow adds this tenant hint in memory; tenant ownership lives in the row's chama_id.
  if (kind === "event") delete data.chamaId;
  return {
    ...tenantBase("audit-log", chamaId, tenantId, data, order, `${kind}:${sourceId(record, `audit-${order}`)}`),
    record_kind: kind, event_type: String(record.type || "event"),
    entity_id: record.entityId ? String(record.entityId) : null,
    recorded_by: userRef(record.by?.id || record.by), occurred_at: dateTime(record.at),
  };
}

function dateTime(value) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function dateOnly(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function userDbId(chamaId, userId) {
  return recordId("user", chamaId, userId);
}

function rowId(table, chamaId, sourceId) {
  return recordId(table, chamaId, sourceId);
}

function sourceId(record, fallback) {
  return String(record?.id ?? record?.callbackKey ?? fallback);
}

function uniqueCallbackKey(record, order, usedKeys) {
  const originalKey = String(record.callbackKey || record.id || `callback-${order}`);
  if (!usedKeys.has(originalKey)) {
    usedKeys.add(originalKey);
    return originalKey;
  }
  const source = sourceId(record, `callback-${order}`);
  let candidate = `${originalKey}:${source}`;
  let suffix = 1;
  while (usedKeys.has(candidate)) candidate = `${originalKey}:${source}:${suffix++}`;
  usedKeys.add(candidate);
  return candidate;
}

function storedRecord(record) {
  return toStoredData(record || {});
}

function tenantBase(table, chamaId, tenantId, record, order, key = sourceId(record, `${table}-${order}`)) {
  return {
    id: rowId(table, chamaId, key),
    chama_id: tenantId,
    source_id: String(key),
    record_data: storedRecord(record),
    record_order: order,
  };
}

function knownUsersFor(state, chamaId) {
  const result = new Set(state.users.filter(user => user.chamaId === chamaId).map(user => String(user.id)));
  for (const loan of state.loans) if (loan.chamaId === chamaId && loan.memberId) result.add(String(loan.memberId));
  for (const register of state.registers) {
    if (register.chamaId !== chamaId) continue;
    for (const attendee of register.attendees || []) if (attendee.userId) result.add(String(attendee.userId));
  }
  return result;
}

function auditChamaIdsByActor(state) {
  const result = new Map();
  for (const user of state.users || []) {
    if (!user?.id || !user.chamaId) continue;
    const actorId = String(user.id);
    const chamaId = String(user.chamaId);
    if (!result.has(actorId)) result.set(actorId, chamaId);
    else if (result.get(actorId) !== chamaId) result.set(actorId, null);
  }
  return result;
}

function auditEventChamaId(record, actorChamaIds) {
  if (record?.chamaId !== undefined && record.chamaId !== null && String(record.chamaId)) {
    return String(record.chamaId);
  }
  const actorId = record?.by?.id || record?.by;
  const actorChamaId = actorId ? actorChamaIds.get(String(actorId)) || null : null;
  const memberChamaId = record?.memberId ? actorChamaIds.get(String(record.memberId)) || null : null;
  if (actorChamaId && memberChamaId && actorChamaId !== memberChamaId) return null;
  return actorChamaId || memberChamaId || null;
}

function userRowsForState(state, tenantIds) {
  const result = [];
  const existingKeys = new Set();
  for (const [order, user] of state.users.entries()) {
    if (!user.chamaId || !user.id) continue;
    const key = `${user.chamaId}:${user.id}`;
    existingKeys.add(key);
    result.push(userRow(user, order, tenantIds.get(String(user.chamaId))));
  }
  let nextOrder = result.length;
  for (const chama of state.chamas) {
    for (const userId of knownUsersFor(state, chama.id)) {
      const key = `${chama.id}:${userId}`;
      if (existingKeys.has(key)) continue;
      const relatedLoan = state.loans.find(item => item.chamaId === chama.id && String(item.memberId) === userId);
      const relatedAttendee = state.registers.flatMap(item => item.chamaId === chama.id ? item.attendees || [] : []).find(item => String(item.userId) === userId);
      const synthetic = {
        id: userId,
        name: relatedLoan?.memberName || relatedAttendee?.name || "Former member",
        phone: `legacy-${stableId("missing-user", key)}@invalid.local`,
        role: "member",
        status: "inactive",
        pinHash: null,
        mustChangePin: true,
        chamaId: chama.id,
        synthetic: true,
      };
      result.push(userRow(synthetic, nextOrder++, tenantIds.get(String(chama.id))));
    }
  }
  return result;
}

function userRow(user, order, tenantId) {
  return {
    id: userDbId(user.chamaId, user.id),
    chama_id: tenantId || stableId("chama", user.chamaId),
    source_id: `${user.chamaId}:${user.id}`,
    name: String(user.name || "Member"),
    phone: String(user.phone || ""),
    email: user.email || null,
    pin_hash: user.pinHash || null,
    must_change_pin: Boolean(user.mustChangePin),
    status: ["active", "invited", "inactive"].includes(user.status) ? user.status : "inactive",
    created_at: dateTime(user.createdAt),
    share_capital_cents: cents(user.shareCapital || 0),
    account_number: user.accountNumber ? String(user.accountNumber).trim() : null,
    record_data: storedRecord(user),
    record_order: order,
  };
}

function membershipRow(user, order, tenantId) {
  return {
    id: rowId("membership", user.chamaId, user.id), chama_id: tenantId,
    user_id: userDbId(user.chamaId, user.id), role: user.role || "member",
    status: ["active", "invited", "inactive"].includes(user.status) ? user.status : "inactive",
    created_at: dateTime(user.createdAt), source_id: String(user.id),
    record_data: storedRecord({ userId: user.id }), record_order: order,
  };
}

function tenantRows(state, chamaId, tenantId, actorChamaIds = auditChamaIdsByActor(state)) {
  const usersForChama = state.users.filter(user => user.chamaId === chamaId);
  const userIds = knownUsersFor(state, chamaId);
  const userRef = source => source && userIds.has(String(source)) ? userDbId(chamaId, source) : null;
  const loansForChama = state.loans.filter(item => item.chamaId === chamaId);
  const loanIds = new Set(loansForChama.map(item => String(item.id)));
  const loanRef = source => source && loanIds.has(String(source)) ? rowId("loans", chamaId, source) : null;
  const orders = records => records.map((record, order) => ({ record, order }));

  const membershipRows = orders(usersForChama).map(({ record, order }) => membershipRow(record, order, tenantId));

  const transactionRecords = state.transactions.filter(item => item.chamaId === chamaId);
  const transactionRows = orders(transactionRecords).map(({ record, order }) => ({
    ...tenantBase("transactions", chamaId, tenantId, record, order),
    member_id: userRef(record.memberId), loan_id: loanRef(record.loanId),
    amount_cents: cents(record.amount), payment_type: String(record.paymentType || "Payment"),
    method: String(record.method || "Unknown"), status: String(record.status || "confirmed"),
    reference_number: record.referenceNumber || record.ref || null,
    recorded_by: userRef(record.recordedBy), occurred_at: dateTime(record.at || record.createdAt),
    interest_cents: cents(record.interestAmount), principal_cents: cents(record.principalAmount),
    welfare_amount_cents: cents(record.welfareAmount), share_capital_amount_cents: cents(record.shareCapitalAmount),
    penalty_amount_cents: cents(record.penaltyAmount),
  }));

  const contributionRecords = [...(state.contributions || []).filter(item => item.chamaId === chamaId)];
  const contributionIds = new Set(contributionRecords.map(item => String(item.id)));
  for (const item of transactionRecords) {
    if (item.paymentType === "Monthly Contribution" && !contributionIds.has(String(item.id))) contributionRecords.push(item);
  }
  const contributionRows = orders(contributionRecords).filter(({ record }) => userRef(record.memberId)).map(({ record, order }) => ({
    ...tenantBase("contributions", chamaId, tenantId, record, order),
    member_id: userRef(record.memberId), recorded_by: userRef(record.recordedBy),
    amount_cents: cents(record.amount), welfare_amount_cents: cents(record.welfareAmount),
    share_capital_amount_cents: cents(record.shareCapitalAmount), penalty_amount_cents: cents(record.penaltyAmount),
    method: String(record.method || "Unknown"), contribution_month: record.contributionMonth
      ? dateOnly(/^\d{4}-\d{2}$/.test(record.contributionMonth) ? `${record.contributionMonth}-01` : record.contributionMonth)
      : null,
    status: String(record.status || "confirmed"), reference_number: record.referenceNumber || record.ref || null,
    note: record.note || null, recorded_at: dateTime(record.at || record.createdAt),
  }));

  const loanRows = orders(loansForChama).map(({ record, order }) => ({
    ...tenantBase("loans", chamaId, tenantId, record, order),
    borrower_id: userDbId(chamaId, record.memberId), principal_cents: cents(record.amount),
    outstanding_cents: cents(record.outstanding), months: [1, 2, 3, 6].includes(Number(record.months)) ? Number(record.months) : 1,
    interest_model: String(record.interestModel || "reducing"), status: String(record.status || "pending"),
    approvals: JSON.stringify(toStoredData(Array.isArray(record.approvals) ? record.approvals : [])),
    created_at: dateTime(record.createdAt), resolved_at: record.resolvedAt ? dateTime(record.resolvedAt) : null,
  }));

  const registerRecords = state.registers.filter(item => item.chamaId === chamaId);
  const registerRows = orders(registerRecords).map(({ record, order }) => {
    const registerData = { ...record };
    delete registerData.attendees;
    return {
      id: rowId("attendance-registers", chamaId, record.id), chama_id: tenantId,
      source_id: String(record.id), meeting_date: dateOnly(record.date), revision: Number(record.revision) || 1,
      record_data: storedRecord(registerData), record_order: order,
    };
  });
  const attendeeRows = [];
  for (const register of registerRecords) {
    for (const [order, attendee] of (register.attendees || []).entries()) {
      if (!userRef(attendee.userId)) continue;
      const source = `${register.id}:${attendee.userId}`;
      attendeeRows.push({
        id: rowId("attendance", chamaId, source), chama_id: tenantId,
        source_id: source, member_id: userRef(attendee.userId), meeting_date: dateOnly(register.date),
        present: Boolean(attendee.present), recorded_by: userRef(register.createdBy?.id || register.editedBy?.id),
        created_at: dateTime(register.createdAt || register.date), record_data: storedRecord({ registerId: register.id, ...attendee }),
        record_order: order,
      });
    }
  }

  const repaymentRecords = transactionRecords.filter(item => item.paymentType === "Loan Repayment" && item.loanId);
  const repaymentRows = orders(repaymentRecords).map(({ record, order }) => ({
    ...tenantBase("loan-repayments", chamaId, tenantId, record, order), loan_id: loanRef(record.loanId),
    member_id: userRef(record.memberId), amount_cents: cents(record.amount),
    principal_cents: cents(record.principalAmount), interest_cents: cents(record.interestAmount),
    method: String(record.method || "Cash"), reference_number: record.referenceNumber || null,
    recorded_at: dateTime(record.at || record.createdAt),
  }));

  const ledgerRows = orders((state.ledgerEntries || []).filter(item => item.chamaId === chamaId)).map(({ record, order }) => ({
    ...tenantBase("ledger-entries", chamaId, tenantId, record, order),
    transaction_id: transactionRecords.some(item => String(item.id) === String(record.transactionId)) ? rowId("transactions", chamaId, record.transactionId) : null,
    account: String(record.account || "unclassified"), debit_cents: cents(record.debit), credit_cents: cents(record.credit),
    description: record.description || null, created_at: dateTime(record.createdAt),
  }));

  const auditRecords = [
    ...state.auditLog.filter(item => auditEventChamaId(item, actorChamaIds) === chamaId).map(item => ({ ...item, _recordKind: "event" })),
    ...state.leadershipChanges.filter(item => item.chamaId === chamaId).map(item => ({ ...item, _recordKind: "leadership" })),
  ];
  const auditRows = orders(auditRecords).map(({ record, order }) => auditLogRow(record, record._recordKind, order, chamaId, tenantId, userRef));

  const messageRows = orders(state.messages.filter(item => item.chamaId === chamaId)).map(({ record, order }) => ({
    ...tenantBase("messages", chamaId, tenantId, record, order), author_id: userRef(record.authorId),
    body: String(record.text || record.body || ""), occurred_at: dateTime(record.at),
  }));

  const invitationRows = orders(state.invitations.filter(item => item.chamaId === chamaId)).map(({ record, order }) => invitationRow(record, order, tenantId, chamaId, userRef));

  const dividendRecords = [
    ...state.dividendCycles.filter(item => item.chamaId === chamaId).map(item => ({ ...item, _recordKind: "cycle" })),
    ...state.payouts.filter(item => item.chamaId === chamaId).map(item => ({ ...item, _recordKind: "payout" })),
  ];
  const dividendRows = orders(dividendRecords).map(({ record, order }) => {
    const kind = record._recordKind;
    const data = { ...record };
    delete data._recordKind;
    return {
      ...tenantBase("dividends", chamaId, tenantId, data, order, `${kind}:${sourceId(record, `dividend-${order}`)}`),
      record_kind: kind, member_id: userRef(record.memberId),
      cycle_start: record.cycleStartDate ? dateOnly(record.cycleStartDate) : null,
      cycle_end: record.cycleEndDate ? dateOnly(record.cycleEndDate) : null,
      amount_cents: cents(record.dividend ?? record.amount ?? record.distributed),
    };
  });

  const penaltyRows = orders(state.penalties.filter(item => item.chamaId === chamaId)).map(({ record, order }) => ({
    ...tenantBase("penalties", chamaId, tenantId, record, order), member_id: userRef(record.memberId),
    amount_cents: cents(record.amount), status: String(record.status || "outstanding"), occurred_at: dateTime(record.at || record.date),
  }));

  const callbackKeys = new Set();
  const callbackRows = orders(state.pendingMpesas.filter(item => item.chamaId === chamaId)).map(({ record, order }) => ({
    ...tenantBase("mpesa-callbacks", chamaId, tenantId, record, order),
    callback_key: uniqueCallbackKey(record, order, callbackKeys),
    transaction_id: record.transactionId && transactionRecords.some(item => String(item.id) === String(record.transactionId))
      ? rowId("transactions", chamaId, record.transactionId) : null,
    payload: toStoredData(record.payload || {}), received_at: dateTime(record.receivedAt),
    mpesa_receipt_number: record.mpesaReceiptNumber || null,
    amount_cents: record.amount === undefined ? null : cents(record.amount),
  }));

  return {
    memberships: membershipRows, contributions: contributionRows, loans: loanRows,
    loanRepayments: repaymentRows, attendanceRegisters: registerRows, attendees: attendeeRows,
    transactions: transactionRows, ledgerEntries: ledgerRows, auditLog: auditRows,
    messages: messageRows, invitations: invitationRows, dividends: dividendRows,
    penalties: penaltyRows, mpesaCallbacks: callbackRows,
  };
}

function recordFromRow(row, chamaId) {
  const value = fromStoredData(row.record_data || {});
  return { ...value, id: value.id ?? row.source_id, chamaId: value.chamaId ?? chamaId };
}

function invitationConflict(message) {
  const error = new Error(message);
  error.code = "INVITATION_ACTIVATION_CONFLICT";
  return error;
}

async function saveInvitations(pool, invitationRecords, idempotencyKey, idempotencyRecord) {
  if (!Array.isArray(invitationRecords) || invitationRecords.length === 0) throw new TypeError("At least one invitation is required.");
  const directory = await chamas.listDirectory(pool);
  const chamaId = String(invitationRecords[0].chamaId);
  const chama = directory.find(item => String(item.source_id) === chamaId);
  const stateChama = directory[0];
  if (!chama || !stateChama || invitationRecords.some(item => String(item.chamaId) !== chamaId)) {
    throw new Error("The invitation's chama is no longer available.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.chama_id', $1, true)", [stateChama.chama_id]);
    const stateRow = await client.query("SELECT state_data FROM chamas WHERE chama_id = $1 FOR UPDATE", [stateChama.chama_id]);
    if (!stateRow.rows[0]) throw new Error("The chama state is no longer available.");
    await client.query("SELECT set_config('app.chama_id', $1, true)", [chama.chama_id]);
    const orderResult = await client.query(
      "SELECT COALESCE(MAX(record_order), -1) + 1 AS next_order FROM invitations WHERE chama_id = $1",
      [chama.chama_id],
    );
    let order = Number(orderResult.rows[0]?.next_order) || 0;
    for (const invitation of invitationRecords) {
      await invitations.insert(client, chama.chama_id, invitationRow(invitation, order++, chama.chama_id, chamaId));
    }
    await client.query("SELECT set_config('app.chama_id', $1, true)", [stateChama.chama_id]);
    const savedIdempotency = await client.query(
      `UPDATE chamas
       SET state_data = jsonb_set(
         COALESCE(state_data, '{}'::jsonb), '{idempotency}',
         COALESCE(state_data->'idempotency', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb), true
       )
       WHERE chama_id = $1`,
      [stateChama.chama_id, idempotencyKey, JSON.stringify(idempotencyRecord)],
    );
    if (savedIdempotency.rowCount === 0) throw new Error("The chama state is no longer available.");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function activateInvitation(pool, invitation, user, { leadershipChange = null, auditEntry = null } = {}) {
  const directory = await chamas.listDirectory(pool);
  const chama = directory.find(item => String(item.source_id) === String(invitation.chamaId));
  if (!chama) throw invitationConflict("The invitation's chama is no longer available.");

  return withTenant(pool, chama.chama_id, async client => {
    const invitationResult = await client.query(
      `SELECT code_hash, phone, status, used_at FROM invitations
       WHERE chama_id = $1 AND source_id = $2 FOR UPDATE`,
      [chama.chama_id, invitation.id],
    );
    const storedInvitation = invitationResult.rows[0];
    if (!storedInvitation || storedInvitation.status !== "invited" || storedInvitation.used_at ||
      storedInvitation.code_hash !== invitation.codeHash || storedInvitation.phone !== invitation.phone) {
      throw invitationConflict("The invitation is already used or has changed.");
    }

    const userOrderResult = await client.query(
      `SELECT COALESCE(MAX(record_order), -1) + 1 AS next_order,
              COALESCE(BOOL_OR(phone = $2 AND status = 'active'), false) AS phone_exists
       FROM users WHERE chama_id = $1`,
      [chama.chama_id, user.phone],
    );
    if (userOrderResult.rows[0]?.phone_exists) {
      const error = new Error("An active account already exists for this phone number.");
      error.code = "INVITATION_PHONE_ALREADY_ACTIVE";
      throw error;
    }
    const membershipOrderResult = await client.query(
      "SELECT COALESCE(MAX(record_order), -1) + 1 AS next_order FROM memberships WHERE chama_id = $1",
      [chama.chama_id],
    );
    const userOrder = Number(userOrderResult.rows[0]?.next_order) || 0;
    const membershipOrder = Number(membershipOrderResult.rows[0]?.next_order) || 0;
    await users.insert(client, chama.chama_id, userRow(user, userOrder, chama.chama_id));
    await memberships.insert(client, chama.chama_id, membershipRow(user, membershipOrder, chama.chama_id));

    if (leadershipChange || auditEntry) {
      const auditOrderResult = await client.query(
        "SELECT COALESCE(MAX(record_order), -1) + 1 AS next_order FROM audit_log WHERE chama_id = $1",
        [chama.chama_id],
      );
      let auditOrder = Number(auditOrderResult.rows[0]?.next_order) || 0;
      if (auditEntry) await auditLog.insert(client, chama.chama_id, auditLogRow(auditEntry, "event", auditOrder++, invitation.chamaId, chama.chama_id));
      if (leadershipChange) await auditLog.insert(client, chama.chama_id, auditLogRow(leadershipChange, "leadership", auditOrder, invitation.chamaId, chama.chama_id));
    }

    const saved = await client.query(
      `UPDATE invitations SET status = 'active', used_at = $3, record_data = $4::jsonb
       WHERE chama_id = $1 AND source_id = $2 AND code_hash = $5
         AND status = 'invited' AND used_at IS NULL
       RETURNING source_id`,
      [chama.chama_id, invitation.id, invitation.usedAt, JSON.stringify(storedRecord(invitation)), invitation.codeHash],
    );
    if (saved.rowCount !== 1) throw invitationConflict("The invitation is already used or has changed.");
  });
}

const activateMemberInvitation = activateInvitation;

async function saveState(pool, state) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await chamas.listDirectory(client);
    const chamasById = new Map(state.chamas.map(chama => [String(chama.id), chama]));
    const tenantIds = new Map(existing.map(row => [row.source_id, row.chama_id]));
    for (const chama of state.chamas) {
      if (!tenantIds.has(String(chama.id))) tenantIds.set(String(chama.id), stableId("chama", chama.id));
    }

    const actorChamaIds = auditChamaIdsByActor(state);
    for (const record of state.auditLog || []) {
      const chamaId = auditEventChamaId(record, actorChamaIds);
      if (!chamaId || !chamasById.has(chamaId)) {
        throw new Error(`Cannot safely assign audit event ${String(record?.id || "(unknown)")} to a chama.`);
      }
    }

    for (const [source, tenantId] of tenantIds) {
      await client.query("SELECT set_config('app.chama_id', $1, true)", [tenantId]);
      for (const repository of clearOrder) await repository.clear(client, tenantId);
      await users.clear(client, tenantId);
      if (!chamasById.has(source)) await chamas.remove(client, tenantId);
    }

    for (const [order, chama] of state.chamas.entries()) {
      const tenantId = tenantIds.get(String(chama.id));
      await client.query("SELECT set_config('app.chama_id', $1, true)", [tenantId]);
      await chamas.save(client, chama, state, order, tenantId);
    }
    const userRows = userRowsForState(state, tenantIds);
    for (const chama of state.chamas) {
      const tenantId = tenantIds.get(String(chama.id));
      await client.query("SELECT set_config('app.chama_id', $1, true)", [tenantId]);
      await users.replace(client, tenantId, userRows.filter(row => row.chama_id === tenantId));
    }

    for (const chama of state.chamas) {
      const tenantId = tenantIds.get(String(chama.id));
      await client.query("SELECT set_config('app.chama_id', $1, true)", [tenantId]);
      const rows = tenantRows(state, chama.id, tenantId, actorChamaIds);
      await memberships.replace(client, tenantId, rows.memberships);
      await loans.replace(client, tenantId, rows.loans);
      await contributions.replace(client, tenantId, rows.contributions);
      await transactions.replace(client, tenantId, rows.transactions);
      await loanRepayments.replace(client, tenantId, rows.loanRepayments);
      await attendance.registers.replace(client, tenantId, rows.attendanceRegisters);
      await attendance.attendees.replace(client, tenantId, rows.attendees);
      await ledgerEntries.replace(client, tenantId, rows.ledgerEntries);
      await auditLog.replace(client, tenantId, rows.auditLog);
      await messages.replace(client, tenantId, rows.messages);
      await invitations.replace(client, tenantId, rows.invitations);
      await dividends.replace(client, tenantId, rows.dividends);
      await penalties.replace(client, tenantId, rows.penalties);
      await mpesaCallbacks.replace(client, tenantId, rows.mpesaCallbacks);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function loadState(pool) {
  const result = stateTemplate();
  const directory = await chamas.listDirectory(pool);
  const loadedUsers = [];

  for (const chama of directory) {
    const bundle = await withTenant(pool, chama.chama_id, async client => ({
      chama: (await client.query("SELECT name, settings, payment_policy, state_data, record_data, record_order FROM chamas WHERE chama_id = $1", [chama.chama_id])).rows[0],
      users: await users.list(client, chama.chama_id),
      transactions: await transactions.list(client, chama.chama_id),
      ledgerEntries: await ledgerEntries.list(client, chama.chama_id),
      loans: await loans.list(client, chama.chama_id),
      invitations: await invitations.list(client, chama.chama_id),
      auditLog: await auditLog.list(client, chama.chama_id),
      messages: await messages.list(client, chama.chama_id),
      penalties: await penalties.list(client, chama.chama_id),
      callbacks: await mpesaCallbacks.list(client, chama.chama_id),
      attendanceRegisters: await attendance.registers.list(client, chama.chama_id),
      attendees: await attendance.attendees.list(client, chama.chama_id),
      dividends: await dividends.list(client, chama.chama_id),
    }));
    const externalId = chama.source_id;
    loadedUsers.push(...bundle.users
      .filter(row => !fromStoredData(row.record_data || {}).synthetic)
      .map(row => {
        const user = fromStoredData(row.record_data || {});
        if (!user.accountNumber && row.account_number) user.accountNumber = row.account_number;
        return { order: Number(row.record_order) || 0, user };
      }));
    if (bundle.chama) {
      const chamaData = fromStoredData(bundle.chama.record_data || {});
      const paymentPolicy = fromStoredData(bundle.chama.payment_policy || {});
      result.chamas.push({
        ...chamaData,
        ...(Object.keys(paymentPolicy).length ? { paymentPolicy } : {}),
        id: externalId,
        name: bundle.chama.name || chama.name,
      });
      if (result.chamas.length === 1) {
        result.settings = fromStoredData(bundle.chama.settings || result.settings);
        const stateData = fromStoredData(bundle.chama.state_data || {});
        result.idempotency = stateData.idempotency || {};
        result.welfareReserve = stateData.welfareReserve || 0;
        result.supportTickets = stateData.supportTickets || [];
        result.supportAgents = stateData.supportAgents || [];
        result.faqs = stateData.faqs || [];
        result.faqFeedback = stateData.faqFeedback || [];
      }
    }
    result.transactions.push(...bundle.transactions.map(row => recordFromRow(row, externalId)));
    result.ledgerEntries.push(...bundle.ledgerEntries.map(row => recordFromRow(row, externalId)));
    result.loans.push(...bundle.loans.map(row => recordFromRow(row, externalId)));
    result.invitations.push(...bundle.invitations.map(row => recordFromRow(row, externalId)));
    result.auditLog.push(...bundle.auditLog.filter(row => row.record_kind === "event").map(row => recordFromRow(row, externalId)));
    result.leadershipChanges.push(...bundle.auditLog.filter(row => row.record_kind === "leadership").map(row => recordFromRow(row, externalId)));
    result.messages.push(...bundle.messages.map(row => recordFromRow(row, externalId)));
    result.penalties.push(...bundle.penalties.map(row => recordFromRow(row, externalId)));
    result.pendingMpesas.push(...bundle.callbacks.map(row => recordFromRow(row, externalId)));

    const attendeesByRegister = new Map();
    for (const row of bundle.attendees) {
      const data = fromStoredData(row.record_data || {});
      const key = String(data.registerId || "");
      delete data.registerId;
      if (!attendeesByRegister.has(key)) attendeesByRegister.set(key, []);
      attendeesByRegister.get(key).push(data);
    }
    result.registers.push(...bundle.attendanceRegisters.map(row => {
      const register = recordFromRow(row, externalId);
      register.attendees = attendeesByRegister.get(String(register.id)) || [];
      return register;
    }));
    for (const row of bundle.dividends) {
      const record = recordFromRow(row, externalId);
      if (row.record_kind === "cycle") result.dividendCycles.push(record);
      else result.payouts.push(record);
    }
  }
  result.users = loadedUsers.sort((left, right) => left.order - right.order).map(item => item.user);
  return result;
}

module.exports = { saveState, loadState, activateInvitation, activateMemberInvitation, saveInvitations, stateTemplate, uniqueCallbackKey };
