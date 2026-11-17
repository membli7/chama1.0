"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  VALID_STATUSES,
  VALID_PRIORITIES,
  VALID_CATEGORIES,
  DEFAULT_FAQS,
  STARTER_SUGGESTIONS,
  SWAHILI_STARTER_SUGGESTIONS,
  isStaffUser,
  isPlatformAdmin,
  isChamaAdmin,
  canAccessTicket,
  sanitizeTicketForUser,
  keywordSearchFaqs,
  generateTicketNumber,
  processAiChat,
} = require("./support-service");

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function ensureSupportUploadDir(baseDir) {
  const dir = path.join(baseDir, "uploads", "support");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function registerSupportRoutes(app, deps) {
  const {
    persist,
    newId,
    now,
    requireAuth,
    requirePinChanged,
    requireRole,
    clean,
    normalizePhone,
    pinHash,
    validPin,
    displayPhone,
    baseDir = path.join(__dirname),
    logger = console,
  } = deps;

  const getState = () => (typeof deps.getState === "function" ? deps.getState() : deps.state);

  const uploadDir = ensureSupportUploadDir(baseDir);

  // Helper to ensure state arrays exist
  function ensureSupportState(source) {
    const s = source || getState();
    if (!s) return s;
    if (!Array.isArray(s.supportTickets)) s.supportTickets = [];
    if (!Array.isArray(s.supportAgents)) s.supportAgents = [];
    if (!Array.isArray(s.faqs) || s.faqs.length === 0) {
      s.faqs = DEFAULT_FAQS.map(f => structuredClone(f));
    }
    if (!Array.isArray(s.faqFeedback)) s.faqFeedback = [];
    return s;
  }

  ensureSupportState(getState());

  // Helper to save attachment from base64
  function saveAttachment(rawAttachment) {
    if (!rawAttachment || typeof rawAttachment !== "object") return null;
    const { originalName, mimeType, data } = rawAttachment;
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`File type ${mimeType} is not supported. Allowed: images, PDF, text.`);
    }
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error("Attachment exceeds maximum allowed size of 5MB.");
    }
    const attachmentId = newId();
    const safeExt = path.extname(clean(originalName)).slice(0, 10).toLowerCase() || ".bin";
    const storedName = `${attachmentId}${safeExt}`;
    const filePath = path.join(uploadDir, storedName);
    fs.writeFileSync(filePath, buffer, { mode: 0o600 });
    return {
      id: attachmentId,
      originalName: clean(originalName).slice(0, 100) || "attachment",
      storedName,
      mimeType,
      size: buffer.length,
      uploadedAt: now(),
    };
  }

  // ---------------------------------------------------------------------------
  // 1. User Support Tickets
  // ---------------------------------------------------------------------------

  // Create Ticket
  app.post("/api/support/tickets", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    const category = clean(req.body?.category);
    const subject = clean(req.body?.subject);
    const description = clean(req.body?.description);
    const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Please select a valid category from: ${VALID_CATEGORIES.join(", ")}.` });
    }
    if (subject.length < 3 || subject.length > 150) {
      return res.status(400).json({ message: "Subject must be between 3 and 150 characters." });
    }
    if (description.length < 5 || description.length > 5000) {
      return res.status(400).json({ message: "Description must be between 5 and 5000 characters." });
    }
    if (rawAttachments.length > 5) {
      return res.status(400).json({ message: "You may attach at most 5 files per message." });
    }

    let savedAttachments = [];
    try {
      savedAttachments = rawAttachments.map(saveAttachment).filter(Boolean);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const ticketId = newId();
    const ticketNumber = generateTicketNumber(state.supportTickets);
    const createdAt = now();

    const ticket = {
      id: ticketId,
      ticketNumber,
      chamaId: req.user.chamaId,
      userId: req.user.id,
      userName: req.user.name,
      userPhone: displayPhone(req.user.phone, true),
      userEmail: req.user.email || null,
      category,
      subject,
      description,
      status: "Open",
      priority: "Medium",
      assignedAgentId: null,
      assignedAgentName: null,
      escalated: false,
      escalatedTo: null,
      escalatedAt: null,
      escalationReason: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
      closedAt: null,
      reopenedAt: null,
      messages: [
        {
          id: newId(),
          ticketId,
          senderId: req.user.id,
          senderName: req.user.name,
          senderRole: req.user.role,
          isStaff: isStaffUser(req.user),
          isInternalNote: false,
          message: description,
          attachments: savedAttachments,
          createdAt,
        },
      ],
      history: [
        {
          id: newId(),
          at: createdAt,
          by: { id: req.user.id, name: req.user.name, role: req.user.role },
          action: "created",
          details: { category, subject },
        },
      ],
    };

    const updated = structuredClone(state);
    ensureSupportState(updated);
    updated.supportTickets.push(ticket);

    // Audit log
    updated.auditLog.push({
      id: newId(),
      type: "support.ticket_created",
      entityId: ticket.id,
      at: createdAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: req.user.chamaId,
      ticketNumber,
      category,
    });

    try {
      await persist(updated);
      return res.status(201).json({
        message: "Support ticket submitted successfully.",
        ticket: sanitizeTicketForUser(ticket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // List Tickets
  app.get("/api/support/tickets", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    const { status, category, priority, assignedOnly, search } = req.query;
    let list = state.supportTickets || [];

    // Scoping & Multi-tenancy enforcement
    if (isPlatformAdmin(req.user)) {
      // Platform admin sees all tickets across chamas
    } else if (req.user.role === "support_agent") {
      const agentProfile = state.supportAgents?.find(a => a.id === req.user.id);
      if (agentProfile?.permissions?.canViewCrossTenant) {
        // Can view across chamas
      } else {
        // Can see assigned tickets or unassigned tickets
        list = list.filter(t => t.assignedAgentId === req.user.id || !t.assignedAgentId || t.chamaId === req.user.chamaId);
      }
    } else if (isChamaAdmin(req.user)) {
      // Chama Chairperson sees tickets from their Chama
      list = list.filter(t => t.chamaId === req.user.chamaId);
    } else {
      // Ordinary users only ever see their own tickets
      list = list.filter(t => t.userId === req.user.id);
    }

    if (assignedOnly === "true") {
      list = list.filter(t => t.assignedAgentId === req.user.id);
    }
    if (status && status !== "All") {
      list = list.filter(t => t.status === status);
    }
    if (category && category !== "All") {
      list = list.filter(t => t.category === category);
    }
    if (priority && priority !== "All") {
      list = list.filter(t => t.priority === priority);
    }
    if (search && typeof search === "string" && search.trim()) {
      const term = search.toLowerCase().trim();
      list = list.filter(t =>
        t.ticketNumber.toLowerCase().includes(term) ||
        t.subject.toLowerCase().includes(term) ||
        t.description.toLowerCase().includes(term) ||
        (t.userName && t.userName.toLowerCase().includes(term))
      );
    }

    // Sort newest first
    const sorted = list.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const sanitized = sorted.map(t => sanitizeTicketForUser(t, req.user));
    return res.json({ data: sanitized });
  });

  // Get Single Ticket
  app.get("/api/support/tickets/:id", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to access this support ticket." });
    }
    return res.json({ data: sanitizeTicketForUser(ticket, req.user) });
  });

  // Add Message or Internal Note to Ticket
  app.post("/api/support/tickets/:id/messages", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to post to this support ticket." });
    }

    const messageText = clean(req.body?.message);
    const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const isStaff = isStaffUser(req.user);
    const isInternalNote = Boolean(req.body?.isInternalNote && isStaff);

    if (ticket.status === "Closed" && !isStaff) {
      return res.status(400).json({ message: "This ticket is closed. Please reopen it to post a message." });
    }
    if (messageText.length < 1 || messageText.length > 5000) {
      return res.status(400).json({ message: "Message must be between 1 and 5000 characters." });
    }
    if (rawAttachments.length > 5) {
      return res.status(400).json({ message: "You may attach at most 5 files per message." });
    }

    let savedAttachments = [];
    try {
      savedAttachments = rawAttachments.map(saveAttachment).filter(Boolean);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const messageId = newId();
    const createdAt = now();

    const newMessage = {
      id: messageId,
      ticketId: targetTicket.id,
      senderId: req.user.id,
      senderName: req.user.name,
      senderRole: req.user.role,
      isStaff,
      isInternalNote,
      message: messageText,
      attachments: savedAttachments,
      createdAt,
    };

    targetTicket.messages.push(newMessage);
    targetTicket.updatedAt = createdAt;

    // If a regular user replies to a ticket waiting on them, transition status to In Progress
    if (!isStaff && targetTicket.status === "Waiting for User") {
      targetTicket.status = "In Progress";
      targetTicket.history.push({
        id: newId(),
        at: createdAt,
        by: { id: req.user.id, name: req.user.name, role: req.user.role },
        action: "status_changed",
        details: { oldStatus: "Waiting for User", newStatus: "In Progress", reason: "User replied" },
      });
    }

    targetTicket.history.push({
      id: newId(),
      at: createdAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      action: isInternalNote ? "internal_note" : "reply",
      isInternal: isInternalNote,
      details: { messageId, preview: messageText.slice(0, 100) },
    });

    updated.auditLog.push({
      id: newId(),
      type: isInternalNote ? "support.internal_note_added" : "support.message_added",
      entityId: targetTicket.id,
      at: createdAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: targetTicket.chamaId,
      ticketNumber: targetTicket.ticketNumber,
      isInternalNote,
    });

    try {
      await persist(updated);
      return res.status(201).json({
        message: isInternalNote ? "Private internal note saved." : "Message sent.",
        data: sanitizeTicketForUser(targetTicket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Reopen Ticket (by user or staff)
  app.post("/api/support/tickets/:id/reopen", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to reopen this support ticket." });
    }
    if (!["Resolved", "Closed"].includes(ticket.status)) {
      return res.status(400).json({ message: "Only resolved or closed tickets can be reopened." });
    }

    const reason = clean(req.body?.reason) || "User requested ticket reopen";
    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const reopenedAt = now();
    const oldStatus = targetTicket.status;

    targetTicket.status = "Open";
    targetTicket.reopenedAt = reopenedAt;
    targetTicket.updatedAt = reopenedAt;

    targetTicket.messages.push({
      id: newId(),
      ticketId: targetTicket.id,
      senderId: req.user.id,
      senderName: req.user.name,
      senderRole: req.user.role,
      isStaff: isStaffUser(req.user),
      isInternalNote: false,
      message: `[Ticket Reopened]: ${reason}`,
      attachments: [],
      createdAt: reopenedAt,
    });

    targetTicket.history.push({
      id: newId(),
      at: reopenedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      action: "reopened",
      details: { oldStatus, newStatus: "Open", reason },
    });

    updated.auditLog.push({
      id: newId(),
      type: "support.ticket_reopened",
      entityId: targetTicket.id,
      at: reopenedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: targetTicket.chamaId,
      ticketNumber: targetTicket.ticketNumber,
      reason,
    });

    try {
      await persist(updated);
      return res.json({
        message: "Support ticket reopened.",
        data: sanitizeTicketForUser(targetTicket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Upload Attachment to Ticket
  app.post("/api/support/tickets/:id/attachments", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to upload attachments to this support ticket." });
    }

    let savedAttachment;
    try {
      savedAttachment = saveAttachment(req.body);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!savedAttachment) {
      return res.status(400).json({ message: "Invalid attachment payload." });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const at = now();

    targetTicket.messages.push({
      id: newId(),
      ticketId: targetTicket.id,
      senderId: req.user.id,
      senderName: req.user.name,
      senderRole: req.user.role,
      isStaff: isStaffUser(req.user),
      isInternalNote: false,
      message: `Uploaded file: ${savedAttachment.originalName}`,
      attachments: [savedAttachment],
      createdAt: at,
    });
    targetTicket.updatedAt = at;

    try {
      await persist(updated);
      return res.status(201).json({ message: "File uploaded successfully.", attachment: savedAttachment });
    } catch (err) {
      return next(err);
    }
  });

  // Download Attachment
  app.get("/api/support/tickets/:id/attachments/:attachmentId", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to access attachments from this ticket." });
    }

    let foundAttachment = null;
    for (const msg of ticket.messages || []) {
      for (const att of msg.attachments || []) {
        if (att.id === req.params.attachmentId) {
          foundAttachment = att;
          break;
        }
      }
      if (foundAttachment) break;
    }

    if (!foundAttachment) {
      return res.status(404).json({ message: "Attachment not found." });
    }

    const filePath = path.join(uploadDir, path.basename(foundAttachment.storedName));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Attachment file missing from storage." });
    }

    res.setHeader("Content-Type", foundAttachment.mimeType || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${foundAttachment.originalName}"`);
    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  });

  // ---------------------------------------------------------------------------
  // 2. Support Agent Ticket Management
  // ---------------------------------------------------------------------------

  // Update Status
  app.patch("/api/support/tickets/:id/status", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user) && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "Only support agents and administrators can change ticket status." });
    }
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to manage this support ticket." });
    }

    const newStatus = clean(req.body?.status);
    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({ message: `Status must be one of: ${VALID_STATUSES.join(", ")}.` });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const oldStatus = targetTicket.status;
    const updatedAt = now();

    targetTicket.status = newStatus;
    targetTicket.updatedAt = updatedAt;
    if (newStatus === "Resolved") targetTicket.resolvedAt = updatedAt;
    if (newStatus === "Closed") targetTicket.closedAt = updatedAt;

    targetTicket.history.push({
      id: newId(),
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      action: "status_changed",
      details: { oldStatus, newStatus },
    });

    updated.auditLog.push({
      id: newId(),
      type: "support.ticket_status_changed",
      entityId: targetTicket.id,
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: targetTicket.chamaId,
      ticketNumber: targetTicket.ticketNumber,
      oldStatus,
      newStatus,
    });

    try {
      await persist(updated);
      return res.json({
        message: `Ticket status updated to ${newStatus}.`,
        data: sanitizeTicketForUser(targetTicket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Update Priority
  app.patch("/api/support/tickets/:id/priority", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user) && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "Only support agents and administrators can change ticket priority." });
    }
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to manage this support ticket." });
    }

    const newPriority = clean(req.body?.priority);
    if (!VALID_PRIORITIES.includes(newPriority)) {
      return res.status(400).json({ message: `Priority must be one of: ${VALID_PRIORITIES.join(", ")}.` });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const oldPriority = targetTicket.priority;
    const updatedAt = now();

    targetTicket.priority = newPriority;
    targetTicket.updatedAt = updatedAt;

    targetTicket.history.push({
      id: newId(),
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      action: "priority_changed",
      details: { oldPriority, newPriority },
    });

    updated.auditLog.push({
      id: newId(),
      type: "support.ticket_priority_changed",
      entityId: targetTicket.id,
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: targetTicket.chamaId,
      ticketNumber: targetTicket.ticketNumber,
      oldPriority,
      newPriority,
    });

    try {
      await persist(updated);
      return res.json({
        message: `Ticket priority updated to ${newPriority}.`,
        data: sanitizeTicketForUser(targetTicket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Assign or Reassign Ticket
  app.post("/api/support/tickets/:id/assign", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    const isPlatform = isPlatformAdmin(req.user);
    const isAgent = req.user.role === "support_agent";

    if (!isPlatform && !isAgent && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "You are not allowed to assign support tickets." });
    }

    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to assign this support ticket." });
    }

    let targetAgentId = clean(req.body?.agentId) || req.user.id;

    // Agent self-assign vs reassigning
    if (isAgent && targetAgentId !== req.user.id) {
      const agentProfile = state.supportAgents?.find(a => a.id === req.user.id);
      if (!agentProfile?.permissions?.canReassign) {
        return res.status(403).json({ message: "You do not have permission to reassign tickets to another agent." });
      }
    }

    const assignedAgentUser = state.users.find(u => u.id === targetAgentId && u.status === "active");
    if (!assignedAgentUser) {
      return res.status(400).json({ message: "Designated support agent was not found or is inactive." });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const oldAgentId = targetTicket.assignedAgentId;
    const oldAgentName = targetTicket.assignedAgentName;
    const updatedAt = now();

    targetTicket.assignedAgentId = assignedAgentUser.id;
    targetTicket.assignedAgentName = assignedAgentUser.name;
    targetTicket.updatedAt = updatedAt;
    if (targetTicket.status === "Open") targetTicket.status = "In Progress";

    targetTicket.history.push({
      id: newId(),
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      action: oldAgentId ? "reassigned" : "assigned",
      details: {
        fromAgentId: oldAgentId,
        fromAgentName: oldAgentName,
        toAgentId: assignedAgentUser.id,
        toAgentName: assignedAgentUser.name,
      },
    });

    updated.auditLog.push({
      id: newId(),
      type: "support.ticket_assigned",
      entityId: targetTicket.id,
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: targetTicket.chamaId,
      ticketNumber: targetTicket.ticketNumber,
      assignedAgentId: assignedAgentUser.id,
      assignedAgentName: assignedAgentUser.name,
    });

    try {
      await persist(updated);
      return res.json({
        message: `Ticket assigned to ${assignedAgentUser.name}.`,
        data: sanitizeTicketForUser(targetTicket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Escalate Ticket
  app.post("/api/support/tickets/:id/escalate", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user) && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "Only support agents and administrators can escalate tickets." });
    }
    const ticket = state.supportTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found." });
    }
    if (!canAccessTicket(req.user, ticket, state)) {
      return res.status(403).json({ message: "You are not authorized to escalate this support ticket." });
    }

    const reason = clean(req.body?.reason);
    if (reason.length < 5) {
      return res.status(400).json({ message: "Please provide an escalation reason of at least 5 characters." });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetTicket = updated.supportTickets.find(t => t.id === req.params.id);
    const escalatedAt = now();

    targetTicket.escalated = true;
    targetTicket.escalatedTo = "platform_admin";
    targetTicket.escalatedAt = escalatedAt;
    targetTicket.escalationReason = reason;
    targetTicket.priority = targetTicket.priority === "Low" ? "High" : "Urgent";
    targetTicket.updatedAt = escalatedAt;

    targetTicket.history.push({
      id: newId(),
      at: escalatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      action: "escalated",
      details: { reason, escalatedTo: "platform_admin" },
    });

    updated.auditLog.push({
      id: newId(),
      type: "support.ticket_escalated",
      entityId: targetTicket.id,
      at: escalatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: targetTicket.chamaId,
      ticketNumber: targetTicket.ticketNumber,
      reason,
    });

    try {
      await persist(updated);
      return res.json({
        message: "Support ticket escalated to platform administrator.",
        data: sanitizeTicketForUser(targetTicket, req.user),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Agent Workload & Activity
  app.get("/api/support/agent/workload", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ message: "Only support agents can view workload metrics." });
    }
    const agentId = req.user.id;
    const tickets = state.supportTickets || [];
    const assigned = tickets.filter(t => t.assignedAgentId === agentId);

    const openCount = assigned.filter(t => t.status === "Open" || t.status === "In Progress").length;
    const waitingCount = assigned.filter(t => t.status === "Waiting for User").length;
    const resolvedCount = assigned.filter(t => t.status === "Resolved").length;
    const closedCount = assigned.filter(t => t.status === "Closed").length;
    const escalatedCount = assigned.filter(t => t.escalated === true).length;

    // Calculate average resolution time for resolved/closed tickets
    const resolvedTickets = assigned.filter(t => t.resolvedAt);
    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        const ms = Date.parse(t.resolvedAt) - Date.parse(t.createdAt);
        return sum + Math.max(0, ms / (1000 * 60 * 60));
      }, 0);
      avgResolutionHours = Math.round((totalHours / resolvedTickets.length) * 10) / 10;
    }

    return res.json({
      data: {
        agentId,
        agentName: req.user.name,
        totalAssigned: assigned.length,
        openCount,
        waitingCount,
        resolvedCount,
        closedCount,
        escalatedCount,
        avgResolutionHours,
        recentAssignedTickets: assigned.slice(-5).map(t => sanitizeTicketForUser(t, req.user)),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Platform Administrator Controls
  // ---------------------------------------------------------------------------

  // List Support Agents
  app.get("/api/support/admin/agents", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    if (!isPlatformAdmin(req.user) && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "Only administrators can view support agent records." });
    }

    const agents = state.supportAgents || [];
    const tickets = state.supportTickets || [];

    const result = agents.map(agent => {
      const user = state.users.find(u => u.id === agent.id);
      const assigned = tickets.filter(t => t.assignedAgentId === agent.id);
      const activeTickets = assigned.filter(t => ["Open", "In Progress", "Waiting for User"].includes(t.status)).length;
      const resolvedTickets = assigned.filter(t => ["Resolved", "Closed"].includes(t.status)).length;
      return {
        id: agent.id,
        name: agent.name || user?.name || "Support Agent",
        phone: displayPhone(agent.phone || user?.phone, true),
        email: agent.email || user?.email || null,
        status: agent.status || user?.status || "active",
        permissions: agent.permissions || {},
        activeTicketCount: activeTickets,
        resolvedTicketCount: resolvedTickets,
        totalAssignedCount: assigned.length,
        createdAt: agent.createdAt || user?.createdAt,
      };
    });

    return res.json({ data: result });
  });

  // Create Support Agent
  app.post("/api/support/admin/agents", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: "Only platform administrators can create Support Agent accounts." });
    }

    const name = clean(req.body?.name);
    const phone = normalizePhone(clean(req.body?.phone));
    const email = clean(req.body?.email);
    const pin = clean(req.body?.pin);
    const requestedPermissions = req.body?.permissions || {};

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ message: "Agent name must be between 2 and 100 characters." });
    }
    if (!phone) {
      return res.status(400).json({ message: "A valid Kenyan phone number is required." });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: "Agent PIN must be 6 to 12 digits." });
    }

    // Check if phone is already registered as an agent
    const existing = state.users.find(u => u.phone === phone && u.status === "active" && u.role === "support_agent");
    if (existing) {
      return res.status(409).json({ message: "A support agent with this phone number already exists." });
    }

    const agentId = newId();
    const createdAt = now();

    const permissions = {
      canAssign: requestedPermissions.canAssign !== false,
      canReassign: Boolean(requestedPermissions.canReassign),
      canChangePriority: requestedPermissions.canChangePriority !== false,
      canChangeStatus: requestedPermissions.canChangeStatus !== false,
      canAddInternalNotes: requestedPermissions.canAddInternalNotes !== false,
      canEscalate: requestedPermissions.canEscalate !== false,
      canClose: requestedPermissions.canClose !== false,
      canManageFaq: requestedPermissions.canManageFaq !== false,
      canViewCrossTenant: Boolean(requestedPermissions.canViewCrossTenant),
    };

    const newUser = {
      id: agentId,
      name,
      phone,
      email: email || null,
      role: "support_agent",
      status: "active",
      pinHash: pinHash(pin),
      mustChangePin: false,
      chamaId: req.user.chamaId || "platform-support",
      createdAt,
      joinedAt: createdAt,
    };

    const newAgent = {
      id: agentId,
      name,
      phone,
      email: email || null,
      status: "active",
      permissions,
      createdAt,
      updatedAt: createdAt,
    };

    const updated = structuredClone(state);
    ensureSupportState(updated);
    updated.users.push(newUser);
    updated.supportAgents.push(newAgent);

    updated.auditLog.push({
      id: newId(),
      type: "support.agent_created",
      entityId: agentId,
      at: createdAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: req.user.chamaId,
      agentName: name,
      agentPhone: displayPhone(phone, true),
    });

    try {
      await persist(updated);
      return res.status(201).json({
        message: "Support agent account created successfully.",
        data: {
          id: agentId,
          name,
          phone: displayPhone(phone, true),
          email,
          status: "active",
          permissions,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  // Update Support Agent (status, permissions)
  app.patch("/api/support/admin/agents/:id", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: "Only platform administrators can modify Support Agent accounts." });
    }

    const agent = state.supportAgents.find(a => a.id === req.params.id);
    if (!agent) {
      return res.status(404).json({ message: "Support agent not found." });
    }

    const { status: newStatus, permissions: newPermissions } = req.body || {};
    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetAgent = updated.supportAgents.find(a => a.id === req.params.id);
    const targetUser = updated.users.find(u => u.id === req.params.id);
    const updatedAt = now();

    if (newStatus && ["active", "suspended", "deactivated"].includes(newStatus)) {
      targetAgent.status = newStatus;
      if (targetUser) targetUser.status = newStatus;
    }

    if (newPermissions && typeof newPermissions === "object") {
      targetAgent.permissions = {
        ...targetAgent.permissions,
        ...newPermissions,
      };
    }
    targetAgent.updatedAt = updatedAt;

    updated.auditLog.push({
      id: newId(),
      type: "support.agent_updated",
      entityId: targetAgent.id,
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: req.user.chamaId,
      status: targetAgent.status,
      permissions: targetAgent.permissions,
    });

    try {
      await persist(updated);
      return res.json({
        message: "Support agent updated.",
        data: targetAgent,
      });
    } catch (err) {
      return next(err);
    }
  });

  // Admin Stats & Workload Performance
  app.get("/api/support/admin/stats", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    if (!isPlatformAdmin(req.user) && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "Only administrators can view support performance metrics." });
    }

    const tickets = state.supportTickets || [];
    const agents = state.supportAgents || [];

    const byStatus = {
      Open: 0,
      "In Progress": 0,
      "Waiting for User": 0,
      Resolved: 0,
      Closed: 0,
    };
    const byPriority = {
      Low: 0,
      Medium: 0,
      High: 0,
      Urgent: 0,
    };
    const byCategory = {};
    for (const cat of VALID_CATEGORIES) byCategory[cat] = 0;

    let escalatedCount = 0;
    let totalResolvedHours = 0;
    let resolvedWithTimes = 0;

    for (const t of tickets) {
      if (byStatus[t.status] !== undefined) byStatus[t.status]++;
      if (byPriority[t.priority] !== undefined) byPriority[t.priority]++;
      if (byCategory[t.category] !== undefined) byCategory[t.category]++;
      else byCategory[t.category] = (byCategory[t.category] || 0) + 1;

      if (t.escalated) escalatedCount++;
      if (t.resolvedAt) {
        const ms = Date.parse(t.resolvedAt) - Date.parse(t.createdAt);
        if (Number.isFinite(ms) && ms >= 0) {
          totalResolvedHours += ms / (1000 * 60 * 60);
          resolvedWithTimes++;
        }
      }
    }

    const avgResolutionHours = resolvedWithTimes > 0
      ? Math.round((totalResolvedHours / resolvedWithTimes) * 10) / 10
      : 0;

    const agentWorkloads = agents.map(a => {
      const assigned = tickets.filter(t => t.assignedAgentId === a.id);
      return {
        agentId: a.id,
        agentName: a.name,
        status: a.status,
        activeTickets: assigned.filter(t => ["Open", "In Progress", "Waiting for User"].includes(t.status)).length,
        resolvedTickets: assigned.filter(t => ["Resolved", "Closed"].includes(t.status)).length,
        totalAssigned: assigned.length,
      };
    });

    return res.json({
      data: {
        totalTickets: tickets.length,
        byStatus,
        byPriority,
        byCategory,
        escalatedCount,
        avgResolutionHours,
        totalAgents: agents.length,
        agentWorkloads,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 4. FAQ System
  // ---------------------------------------------------------------------------

  // List FAQs (Search and Filter)
  app.get("/api/faqs", requireAuth, (req, res) => {
    const state = ensureSupportState(getState());
    const { search, category, all } = req.query;
    const isStaff = isStaffUser(req.user);

    let list = state.faqs || [];
    if (!isStaff || all !== "true") {
      list = list.filter(f => f.published !== false);
    }
    const filtered = keywordSearchFaqs(list, search, category);
    return res.json({ data: filtered });
  });

  // Submit Feedback (Helpful / Not Helpful)
  app.post("/api/faqs/:id/feedback", requireAuth, async (req, res, next) => {
    const state = ensureSupportState(getState());
    const faq = state.faqs.find(f => f.id === req.params.id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ article not found." });
    }
    const vote = clean(req.body?.vote);
    if (!["helpful", "not_helpful"].includes(vote)) {
      return res.status(400).json({ message: "Vote must be either 'helpful' or 'not_helpful'." });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetFaq = updated.faqs.find(f => f.id === req.params.id);
    const existingFeedback = updated.faqFeedback.find(
      fb => fb.faqId === req.params.id && fb.userId === req.user.id
    );

    if (existingFeedback) {
      if (existingFeedback.vote === vote) {
        return res.json({
          message: "You have already submitted this feedback.",
          helpfulCount: targetFaq.helpfulCount,
          notHelpfulCount: targetFaq.notHelpfulCount,
        });
      }
      // Reversing previous vote
      if (existingFeedback.vote === "helpful") {
        targetFaq.helpfulCount = Math.max(0, (targetFaq.helpfulCount || 1) - 1);
        targetFaq.notHelpfulCount = (targetFaq.notHelpfulCount || 0) + 1;
      } else {
        targetFaq.notHelpfulCount = Math.max(0, (targetFaq.notHelpfulCount || 1) - 1);
        targetFaq.helpfulCount = (targetFaq.helpfulCount || 0) + 1;
      }
      existingFeedback.vote = vote;
      existingFeedback.updatedAt = now();
    } else {
      // New vote
      if (vote === "helpful") targetFaq.helpfulCount = (targetFaq.helpfulCount || 0) + 1;
      else targetFaq.notHelpfulCount = (targetFaq.notHelpfulCount || 0) + 1;

      updated.faqFeedback.push({
        id: newId(),
        faqId: targetFaq.id,
        userId: req.user.id,
        vote,
        createdAt: now(),
      });
    }

    try {
      await persist(updated);
      return res.json({
        message: "Thank you for your feedback.",
        helpfulCount: targetFaq.helpfulCount,
        notHelpfulCount: targetFaq.notHelpfulCount,
      });
    } catch (err) {
      return next(err);
    }
  });

  // Create FAQ (Staff / Admin)
  app.post("/api/faqs", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ message: "Only support agents and administrators can author FAQs." });
    }

    const category = clean(req.body?.category);
    const question = clean(req.body?.question);
    const answer = clean(req.body?.answer);
    const published = req.body?.published !== false;

    if (category.length < 2) {
      return res.status(400).json({ message: "Category name must be at least 2 characters." });
    }
    if (question.length < 5 || question.length > 300) {
      return res.status(400).json({ message: "Question must be between 5 and 300 characters." });
    }
    if (answer.length < 10 || answer.length > 5000) {
      return res.status(400).json({ message: "Answer must be between 10 and 5000 characters." });
    }

    const newFaq = {
      id: newId(),
      category,
      question,
      answer,
      published,
      helpfulCount: 0,
      notHelpfulCount: 0,
      createdBy: { id: req.user.id, name: req.user.name },
      createdAt: now(),
      updatedAt: now(),
    };

    const updated = structuredClone(state);
    ensureSupportState(updated);
    updated.faqs.push(newFaq);

    updated.auditLog.push({
      id: newId(),
      type: "faq.created",
      entityId: newFaq.id,
      at: now(),
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: req.user.chamaId,
      question,
      category,
    });

    try {
      await persist(updated);
      return res.status(201).json({ message: "FAQ created successfully.", data: newFaq });
    } catch (err) {
      return next(err);
    }
  });

  // Update FAQ
  app.put("/api/faqs/:id", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ message: "Only support agents and administrators can edit FAQs." });
    }

    const faq = state.faqs.find(f => f.id === req.params.id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ article not found." });
    }

    const category = clean(req.body?.category) || faq.category;
    const question = clean(req.body?.question) || faq.question;
    const answer = clean(req.body?.answer) || faq.answer;
    const published = req.body?.published !== undefined ? Boolean(req.body.published) : faq.published;

    const updated = structuredClone(state);
    ensureSupportState(updated);
    const targetFaq = updated.faqs.find(f => f.id === req.params.id);
    const updatedAt = now();

    targetFaq.category = category;
    targetFaq.question = question;
    targetFaq.answer = answer;
    targetFaq.published = published;
    targetFaq.updatedBy = { id: req.user.id, name: req.user.name };
    targetFaq.updatedAt = updatedAt;

    updated.auditLog.push({
      id: newId(),
      type: "faq.updated",
      entityId: targetFaq.id,
      at: updatedAt,
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: req.user.chamaId,
      question,
      category,
      published,
    });

    try {
      await persist(updated);
      return res.json({ message: "FAQ updated successfully.", data: targetFaq });
    } catch (err) {
      return next(err);
    }
  });

  // Delete FAQ
  app.delete("/api/faqs/:id", requireAuth, requirePinChanged, async (req, res, next) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ message: "Only support agents and administrators can delete FAQs." });
    }

    const faq = state.faqs.find(f => f.id === req.params.id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ article not found." });
    }

    const updated = structuredClone(state);
    ensureSupportState(updated);
    updated.faqs = updated.faqs.filter(f => f.id !== req.params.id);

    updated.auditLog.push({
      id: newId(),
      type: "faq.deleted",
      entityId: req.params.id,
      at: now(),
      by: { id: req.user.id, name: req.user.name, role: req.user.role },
      chamaId: req.user.chamaId,
      question: faq.question,
    });

    try {
      await persist(updated);
      return res.json({ message: "FAQ article deleted." });
    } catch (err) {
      return next(err);
    }
  });

  // FAQ Admin & Insights Metrics
  app.get("/api/faqs/admin/metrics", requireAuth, requirePinChanged, (req, res) => {
    const state = ensureSupportState(getState());
    if (!isStaffUser(req.user) && !isChamaAdmin(req.user)) {
      return res.status(403).json({ message: "Only support staff can view FAQ performance metrics." });
    }

    const faqs = state.faqs || [];
    const tickets = state.supportTickets || [];

    // Identify FAQs receiving negative feedback
    const negativeFeedbackFaqs = faqs.filter(
      f => (f.notHelpfulCount || 0) > (f.helpfulCount || 0) || (f.notHelpfulCount || 0) >= 3
    );

    // Group frequently submitted tickets by category and common subjects
    const ticketCategoryCounts = {};
    for (const t of tickets) {
      ticketCategoryCounts[t.category] = (ticketCategoryCounts[t.category] || 0) + 1;
    }

    const frequentlySubmitted = Object.entries(ticketCategoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      data: {
        totalFaqs: faqs.length,
        publishedCount: faqs.filter(f => f.published !== false).length,
        negativeFeedbackCount: negativeFeedbackFaqs.length,
        negativeFeedbackFaqs,
        frequentlySubmittedCategories: frequentlySubmitted,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 4. In-App AI Support Assistant Bubble Endpoints (100% In-House, No External API)
  // ---------------------------------------------------------------------------

  // Get starter suggestions for the AI chat bubble
  app.get("/api/support/ai/suggestions", (req, res) => {
    const language = String(req.query?.language || "").toLowerCase();
    return res.json({ data: language.startsWith("sw") ? SWAHILI_STARTER_SUGGESTIONS : STARTER_SUGGESTIONS });
  });

  // Chat with the in-app AI assistant (No external LLM/Gemini API calls)
  app.post("/api/support/ai/chat", (req, res) => {
    const state = ensureSupportState(getState());
    const message = clean(req.body?.message || "");

    if (!message || message.length > 2000) {
      return res.status(400).json({ message: "Please provide a valid question under 2000 characters." });
    }

    if (!req.user && req.session?.userId) {
      req.user = state.users.find(item => item.id === req.session.userId && item.status === "active");
    }
    const userChama = req.user?.chamaId
      ? state.chamas?.find(chama => chama.id === req.user.chamaId)
      : null;
    const loanPolicyEvent = req.user?.chamaId && Array.isArray(state.auditLog)
      ? state.auditLog.slice().reverse().find(event => event.type === "loan.policy.updated" && event.chamaId === req.user.chamaId && event.policy)
      : null;
    const context = {
      user: req.user ? { id: req.user.id, name: req.user.name, role: req.user.role, chamaId: req.user.chamaId } : null,
      settings: userChama?.settings || {},
      loanPolicy: loanPolicyEvent?.policy || null,
      language: req.body?.language,
    };

    const aiResponse = processAiChat(message, context, state);
    return res.json({ data: aiResponse });
  });
}

module.exports = {
  registerSupportRoutes,
};
