// cosmos-eventkit — calendar reader for the cosmos-mcp daemon.
//
// Replaces the old path of snapshot-copying Calendar.sqlitedb and
// parsing it by hand. EventKit is the stable API: it gives structured
// attendees (name + email), real recurrence flags, and the calendar's
// account type, none of which the raw sqlite exposes cleanly.
//
// Emits NDJSON to stdout — one JSON object per event occurrence. The
// TypeScript calendar source (src/sources/calendar/cli.ts) spawns this
// binary, reads the stream, aggregates, and ships to cosmos.
//
// TCC: this binary is signed and carries an embedded __info_plist
// section with NSCalendarsFullAccessUsageDescription, so macOS shows a
// calendar-access prompt on first run and remembers the grant against
// the binary's designated requirement. Exit 2 means access was denied.
//
// Build: see scripts/build-daemon-app.sh — compiled universal, plist
// embedded via -sectcreate, signed with the Developer ID identity.

import EventKit
import Foundation

// ---- args -------------------------------------------------------------------

var windowDays = 365
do {
    let argv = CommandLine.arguments
    if let i = argv.firstIndex(where: { $0 == "--days" || $0 == "-d" }),
       i + 1 < argv.count, let n = Int(argv[i + 1]) {
        windowDays = max(1, min(3650, n))
    }
}

// ---- output shape -----------------------------------------------------------

struct Attendee: Codable {
    let name: String?
    let email: String?
}

struct EventOut: Codable {
    let title: String
    let calendar: String
    let calendar_type: String
    let start: String          // ISO8601
    let end: String?           // ISO8601
    let all_day: Bool
    let recurring: Bool
    let has_notes: Bool
    let location: String?
    let attendees: [Attendee]
    let organizer: Attendee?
}

// ---- helpers ----------------------------------------------------------------

func calendarTypeName(_ t: EKCalendarType) -> String {
    switch t {
    case .local:        return "local"
    case .calDAV:       return "caldav"
    case .exchange:     return "exchange"
    case .subscription: return "subscription"
    case .birthday:     return "birthday"
    @unknown default:   return "other"
    }
}

// EKParticipant stores the address as a mailto: URL. Pull the bare
// address out; participants without one (rooms, resources) yield nil.
func emailOf(_ p: EKParticipant) -> String? {
    guard let url = p.url as URL? else { return nil }
    let s = url.absoluteString
    if s.lowercased().hasPrefix("mailto:") {
        let addr = String(s.dropFirst("mailto:".count))
        return addr.isEmpty ? nil : addr.removingPercentEncoding ?? addr
    }
    return nil
}

func participant(_ p: EKParticipant?) -> Attendee? {
    guard let p = p else { return nil }
    let email = emailOf(p)
    let name = p.name
    if email == nil && (name == nil || name!.isEmpty) { return nil }
    return Attendee(name: name, email: email)
}

func fail(_ msg: String, code: Int32) -> Never {
    FileHandle.standardError.write(Data("cosmos-eventkit: \(msg)\n".utf8))
    exit(code)
}

// ---- access -----------------------------------------------------------------

let store = EKEventStore()

// @MainActor: top-level code (and thus `store`) is main-actor-isolated
// under Swift 6. Annotating keeps the EKEventStore access on the same
// actor instead of tripping strict-concurrency diagnostics.
@MainActor
func requestAccess() async -> Bool {
    // macOS 14 split calendar access into full vs write-only. Reading
    // events needs full access; the pre-14 API grants read+write in one.
    if #available(macOS 14.0, *) {
        do { return try await store.requestFullAccessToEvents() }
        catch { return false }
    } else {
        return await withCheckedContinuation { cont in
            store.requestAccess(to: .event) { granted, _ in
                cont.resume(returning: granted)
            }
        }
    }
}

// ---- main -------------------------------------------------------------------

let granted = await requestAccess()
if !granted {
    fail("calendar access denied. grant it in System Settings → Privacy & Security → Calendars.", code: 2)
}

let now = Date()
guard let windowStart = Calendar.current.date(byAdding: .day, value: -windowDays, to: now) else {
    fail("could not compute window start", code: 1)
}

// nil calendars = every calendar the user has. The predicate expands
// recurring events into individual occurrences inside the window.
let predicate = store.predicateForEvents(withStart: windowStart, end: now, calendars: nil)
let events = store.events(matching: predicate)

let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime]

let encoder = JSONEncoder()
var emitted = 0
var buffer = ""

for ev in events {
    guard let title = ev.title, !title.isEmpty else { continue }
    guard let startDate = ev.startDate else { continue }

    let attendees: [Attendee] = (ev.attendees ?? []).compactMap { participant($0) }

    let row = EventOut(
        title: title,
        calendar: ev.calendar?.title ?? "",
        calendar_type: ev.calendar.map { calendarTypeName($0.type) } ?? "other",
        start: iso.string(from: startDate),
        end: ev.endDate.map { iso.string(from: $0) },
        all_day: ev.isAllDay,
        recurring: ev.hasRecurrenceRules,
        has_notes: !(ev.notes ?? "").isEmpty,
        location: (ev.location ?? "").isEmpty ? nil : ev.location,
        attendees: attendees,
        organizer: participant(ev.organizer)
    )

    if let data = try? encoder.encode(row), let line = String(data: data, encoding: .utf8) {
        buffer += line + "\n"
        emitted += 1
        // Flush in chunks so a huge calendar does not balloon memory.
        if buffer.utf8.count > 64_000 {
            FileHandle.standardOutput.write(Data(buffer.utf8))
            buffer = ""
        }
    }
}

if !buffer.isEmpty {
    FileHandle.standardOutput.write(Data(buffer.utf8))
}

FileHandle.standardError.write(Data("cosmos-eventkit: \(emitted) events over last \(windowDays)d\n".utf8))
exit(0)
