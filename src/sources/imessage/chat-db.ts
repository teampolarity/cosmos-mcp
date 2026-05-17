// chat-db.ts — reads ~/Library/Messages/chat.db and yields canonical
// turn objects in chronological order, chunked for the server endpoint.
//
// Apple stores message.date as nanoseconds since 2001-01-01T00:00:00Z.
// Apple's epoch offset from Unix is 978307200 seconds.

import Database from "better-sqlite3";

const APPLE_EPOCH_OFFSET_SECONDS = 978307200;

export interface CanonicalTurn {
  turn_id: string;
  thread_id: string;
  from_handle: string;
  occurred_at: string;
  text?: string;
  participants: string[];
}

export interface ReadTurnsOptions {
  dbPath: string;
  since: Date;
  chunkSize: number;
  verbose?: boolean;
}

export async function* readTurns(opts: ReadTurnsOptions): AsyncGenerator<CanonicalTurn[]> {
  const db = new Database(opts.dbPath, { readonly: true, fileMustExist: true });
  // better-sqlite3 needs an explicit opt-in to bind/return BigInts. Apple
  // timestamps are 64-bit nanoseconds and overflow JS Number near year 2262
  // (and the SQL comparison must be numeric, not lexical).
  db.defaultSafeIntegers(true);
  try {
    const sinceSeconds = Math.max(0, Math.floor(opts.since.getTime() / 1000) - APPLE_EPOCH_OFFSET_SECONDS);
    const sinceNs = BigInt(sinceSeconds) * 1_000_000_000n;
    if (opts.verbose) {
      process.stderr.write(`[chat-db] since=${opts.since.toISOString()} sinceNs=${sinceNs.toString()}\n`);
    }
    const rows = db.prepare(`
      SELECT
        m.ROWID         AS row_id,
        m.guid          AS message_guid,
        m.text          AS text,
        m.is_from_me    AS is_from_me,
        m.date          AS date_ns,
        h.id            AS handle_id,
        c.guid          AS chat_guid,
        c.ROWID         AS chat_row
      FROM message m
      LEFT JOIN handle h ON h.ROWID = m.handle_id
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat c ON c.ROWID = cmj.chat_id
      WHERE m.date >= ?
      ORDER BY m.date ASC
    `).all(sinceNs) as any[];
    if (opts.verbose) {
      const distinctChats = new Set(rows.map((r) => String(r.chat_guid))).size;
      process.stderr.write(`[chat-db] sql returned ${rows.length} rows across ${distinctChats} distinct chats\n`);
    }

    // Keys are BigInt (defaultSafeIntegers) — use the string form for Map
    // lookups so the participant join compares cleanly to chat_row below.
    const participantsByChat = new Map<string, string[]>();
    const participantRows = db.prepare(`
      SELECT chj.chat_id AS chat_id, h.id AS handle_id
      FROM chat_handle_join chj
      JOIN handle h ON h.ROWID = chj.handle_id
    `).all() as Array<{ chat_id: bigint; handle_id: string }>;
    for (const r of participantRows) {
      const key = r.chat_id.toString();
      const arr = participantsByChat.get(key) ?? [];
      arr.push(r.handle_id);
      participantsByChat.set(key, arr);
    }

    // Slop filter — don't ship threads that aren't relationships.
    // Two rules, run after fetch so we know the full picture per chat:
    //
    //  1. No outgoing reply from the user. If the user has never sent a
    //     message in this thread, it isn't a conversation. It's an OTP
    //     code, a delivery alert, a cold pitch, a service notification.
    //  2. All non-self handles are short codes. Real phone numbers are
    //     7+ digits; SMS short codes are 3-6 (e.g. "62227", "AMZL").
    //     Threads with only short-code participants are bulk SMS, not
    //     relationships, even if the user once replied STOP.
    const SHORT_CODE_RE = /^\+?[A-Z0-9]{3,6}$/i;
    const userRepliedByGuid = new Map<string, boolean>();
    const chatRowKeyByGuid = new Map<string, string>();
    for (const r of rows) {
      const guid = String(r.chat_guid);
      chatRowKeyByGuid.set(guid, (r.chat_row as bigint).toString());
      const isFromMe = typeof r.is_from_me === "bigint" ? r.is_from_me !== 0n : !!r.is_from_me;
      if (isFromMe) userRepliedByGuid.set(guid, true);
    }
    const slopReason = new Map<string, "no_reply" | "short_code_only">();
    for (const [guid, chatRowKey] of chatRowKeyByGuid) {
      if (!userRepliedByGuid.get(guid)) {
        slopReason.set(guid, "no_reply");
        continue;
      }
      const handles = participantsByChat.get(chatRowKey) ?? [];
      const nonSelf = handles.filter((h) => h && h !== "self");
      if (nonSelf.length > 0 && nonSelf.every((h) => SHORT_CODE_RE.test(h))) {
        slopReason.set(guid, "short_code_only");
      }
    }
    const slopThreads = new Set(slopReason.keys());
    if (opts.verbose && slopThreads.size > 0) {
      let noReply = 0, shortCode = 0;
      for (const reason of slopReason.values()) {
        if (reason === "no_reply") noReply++;
        else shortCode++;
      }
      process.stderr.write(
        `[chat-db] filtered ${slopThreads.size} slop threads ` +
        `(${noReply} no-user-reply, ${shortCode} short-code-only)\n`
      );
    }

    let chunk: CanonicalTurn[] = [];
    let droppedRows = 0;
    for (const r of rows) {
      if (slopThreads.has(String(r.chat_guid))) { droppedRows++; continue; }
      // date_ns is a BigInt; divide by 1e6 to get milliseconds-since-Apple-epoch
      // safely without losing precision in the integer range we care about.
      const dateNs = r.date_ns as bigint;
      const dateMs = Number(dateNs / 1_000_000n) + APPLE_EPOCH_OFFSET_SECONDS * 1000;
      const occurredAt = new Date(dateMs).toISOString();
      const isFromMe = typeof r.is_from_me === "bigint" ? r.is_from_me !== 0n : !!r.is_from_me;
      const fromHandle = isFromMe ? "self" : (r.handle_id ?? "unknown");
      const threadParticipants = participantsByChat.get((r.chat_row as bigint).toString()) ?? [];
      const allParticipants = ["self", ...threadParticipants];
      chunk.push({
        turn_id: `imessage:${r.message_guid ?? String(r.row_id)}`,
        thread_id: r.chat_guid,
        from_handle: fromHandle,
        occurred_at: occurredAt,
        text: r.text ?? undefined,
        participants: Array.from(new Set(allParticipants)),
      });
      if (chunk.length >= opts.chunkSize) {
        yield chunk;
        chunk = [];
      }
    }
    if (chunk.length) yield chunk;
    if (opts.verbose && droppedRows > 0) {
      process.stderr.write(`[chat-db] dropped ${droppedRows} rows from filtered slop threads\n`);
    }
  } finally {
    db.close();
  }
}
