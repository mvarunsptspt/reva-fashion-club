/* REVA Fashion Club portal — Step 16 (91 features).
   Concatenated from the five Step 16 packages (events, finance,
   engage, people, shell). Loaded after portal.js; portal.js calls
   window.__f91Init(window.Portal91) at the end of boot().
   Each package exposes one f91Init* function; the master init below
   runs them in order. No external-platform references anywhere. */


/* ================= events/events.js ================= */

/* REVA Fashion Club portal — Step 16 (91 features), EVENTS & SHOWS package.
   Features: #1, #2, #7, #10, #15, #17, #18, #21, #30, #33, #39, #46,
   #53, #54, #56, #58, #64, #68, #85.
   Plain ES5, matching portal.js style. Loaded after portal.js; the
   coordinator calls f91InitEvents(window.Portal91) from the master
   window.__f91Init. All top-level names inside are prefixed ev_.
   Requires the lineup_segments table (see notes.md — SQL ADDITION). */

var ev_P = null;
var ev_events = [];
var ev_rsvps = [];
var ev_attendance = [];
var ev_availability = [];
var ev_duties = [];
var ev_rooms = [];
var ev_videos = [];
var ev_notes = [];
var ev_lineup = [];
var ev_tasks = [];
var ev_openEvent = null;      /* event id whose detail panel is open */
var ev_detailTab = "rsvp";    /* which detail panel is shown */
var ev_countdownTimer = null;

/* Per-member attendance % — used by the people package in the profile
   modal. Returns a Promise<number|null> (null = no attendance rows yet,
   or the bridge is not ready). */
function f91AttendancePct(memberId) {
  if (!ev_P || !ev_P.client || !memberId) return Promise.resolve(null);
  return ev_P.client.from("attendance").select("present").eq("member_id", memberId)
    .then(function (res) {
      if (res.error || !res.data || !res.data.length) return null;
      var present = 0, i;
      for (i = 0; i < res.data.length; i++) if (res.data[i].present) present++;
      return Math.round(present * 100 / res.data.length);
    })
    .catch(function () { return null; });
}

function f91InitEvents(P) {
  ev_P = P;
  var me = P.me;
  if (!me) return;

  /* ---------- role gates ---------- */
  function ev_canCreateEvent() {
    return me.role === "admin" || me.role === "second_admin" ||
      me.role === "president" || me.role === "vice_president";
  }
  function ev_canMarkAttendance() { return ev_canCreateEvent(); }
  function ev_canBookRoom() {
    return me.role === "admin" || me.role === "second_admin";
  }
  function ev_canManageVideos() {
    /* Coordinator fix: the Main Admin manages everything a Second
       Admin can, so video-archive management is admin + second_admin. */
    return me.role === "admin" || me.role === "second_admin";
  }
  function ev_canEditDuty() {
    return me.role === "admin" || me.role === "president" ||
      me.role === "vice_president";
  }
  function ev_isOfficial() { return P.isOfficialOrAbove(); }
  function ev_isMainAdmin() { return P.isMainAdmin(); }

  /* ---------- small helpers ---------- */
  function ev_el(id) { return P.$(id); }
  function ev_fmt(dt) {
    if (!dt) return "—";
    var d = new Date(dt);
    if (isNaN(d.getTime())) return String(dt);
    return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function ev_fmtDate(dt) {
    if (!dt) return "—";
    var d = new Date(dt);
    if (isNaN(d.getTime())) return String(dt);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }
  function ev_toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function ev_toISO(localVal) {
    if (!localVal) return null;
    var d = new Date(localVal);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  function ev_nameOf(id) {
    var list = P.directory || [], i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name || list[i].login_id || "Member";
    return "Member";
  }
  function ev_rsvpCount(eventId, status) {
    var n = 0, i;
    for (i = 0; i < ev_rsvps.length; i++)
      if (ev_rsvps[i].event_id === eventId && ev_rsvps[i].status === status) n++;
    return n;
  }
  function ev_myRsvp(eventId) {
    var i;
    for (i = 0; i < ev_rsvps.length; i++)
      if (ev_rsvps[i].event_id === eventId && ev_rsvps[i].member_id === me.id) return ev_rsvps[i].status;
    return null;
  }
  function ev_attRows(eventId) {
    return ev_attendance.filter(function (r) { return r.event_id === eventId; });
  }
  function ev_attPctFor(memberId) {
    var rows = ev_attendance.filter(function (r) { return r.member_id === memberId; });
    if (!rows.length) return null;
    var present = 0, i;
    for (i = 0; i < rows.length; i++) if (rows[i].present) present++;
    return Math.round(present * 100 / rows.length);
  }
  function ev_nextEvent() {
    var now = Date.now(), best = null, i;
    for (i = 0; i < ev_events.length; i++) {
      var t = new Date(ev_events[i].starts_at).getTime();
      if (!isNaN(t) && t >= now && (!best || t < new Date(best.starts_at).getTime())) best = ev_events[i];
    }
    return best;
  }

  /* ---------- data loading ---------- */
  async function ev_loadAll() {
    var c = P.client;
    async function sel(table, orderCol) {
      var q = c.from(table).select("*");
      if (orderCol) q = q.order(orderCol);
      var res = await q;
      if (res.error) { console.warn("f91 events: could not load " + table, res.error.message); return []; }
      return res.data || [];
    }
    ev_events = await sel("events", "starts_at");
    ev_rsvps = await sel("event_rsvps");
    ev_attendance = await sel("attendance");
    ev_availability = await sel("availability");
    ev_duties = await sel("duty_roster");
    ev_rooms = await sel("room_bookings", "starts_at");
    ev_videos = await sel("show_videos", "year");
    ev_notes = await sel("rehearsal_notes", "created_at");
    ev_lineup = await sel("lineup_segments", "position");
    try {
      var tr = await c.from("tasks").select("*").order("due_date");
      ev_tasks = tr.error ? [] : (tr.data || []);
    } catch (e) { ev_tasks = []; }
  }

  /* ---------- events list (#1, #18) ---------- */
  function ev_renderEvents() {
    var box = ev_el("ev_eventList");
    if (!box) return;
    if (!ev_events.length) {
      box.innerHTML = '<p class="empty">No events yet. ' +
        (ev_canCreateEvent() ? "Create the first one above." : "Check back soon — the officials will post auditions, shows and rehearsals here.") + "</p>";
      return;
    }
    var now = Date.now();
    var html = "", i, ev, past, counts, myStatus;
    var sorted = ev_events.slice().sort(function (a, b) {
      return new Date(b.starts_at) - new Date(a.starts_at);
    });
    for (i = 0; i < sorted.length; i++) {
      ev = sorted[i];
      past = new Date(ev.ends_at || ev.starts_at).getTime() < now;
      counts = {
        going: ev_rsvpCount(ev.id, "going"),
        maybe: ev_rsvpCount(ev.id, "maybe"),
        not: ev_rsvpCount(ev.id, "not_going")
      };
      myStatus = ev_myRsvp(ev.id);
      html += '<div class="row-item">' +
        (ev.poster_url ? '<div class="avatar has-photo" style="width:64px;height:64px;border-radius:12px"><img src="' + P.esc(ev.poster_url) + '" alt="" /></div>' : "") +
        '<div class="body"><b>' + P.esc(ev.title) + "</b> " +
        '<span class="chip ghost">' + P.esc(ev.kind || "event") + "</span> " +
        (past ? '<span class="chip ghost">Past</span>' : '<span class="chip orange">Upcoming</span>') +
        '<div class="meta">' + P.esc(ev_fmt(ev.starts_at)) + (ev.ends_at ? " – " + P.esc(ev_fmt(ev.ends_at)) : "") +
        (ev.venue ? " &middot; " + P.esc(ev.venue) : "") + "</div>" +
        (ev.description ? "<p>" + P.esc(ev.description) + "</p>" : "") +
        '<div class="meta" style="margin-top:6px">RSVP — Going ' + counts.going + " &middot; Maybe " + counts.maybe + " &middot; Not going " + counts.not + "</div>" +
        '<div class="toolbar" style="margin:10px 0 0">' +
        '<button class="btn ghost small" type="button" data-ev-rsvp="going" data-ev-id="' + P.esc(ev.id) + '"' + (myStatus === "going" ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">Going</button>" +
        '<button class="btn ghost small" type="button" data-ev-rsvp="maybe" data-ev-id="' + P.esc(ev.id) + '"' + (myStatus === "maybe" ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">Maybe</button>" +
        '<button class="btn ghost small" type="button" data-ev-rsvp="not_going" data-ev-id="' + P.esc(ev.id) + '"' + (myStatus === "not_going" ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">Not going</button>" +
        '<button class="btn ghost small" type="button" data-ev-detail="' + P.esc(ev.id) + '" data-ev-id="' + P.esc(ev.id) + '">' + (ev_openEvent === ev.id ? "Hide details" : "Details") + "</button>" +
        (ev_isMainAdmin() && past ? '<button class="btn ghost small" type="button" data-ev-dup="' + P.esc(ev.id) + '" data-ev-id="' + P.esc(ev.id) + '">Duplicate</button>' : "") +
        "</div>" +
        (ev_openEvent === ev.id ? ev_detailHtml(ev) : "") +
        "</div></div>";
    }
    box.innerHTML = html;
  }

  /* Detail panel under one event: attendance list + marking (#2/#7/#10/#33),
     availability (#17), duty roster (#39/#56), lineup (#30), notes (#58). */
  function ev_detailHtml(ev) {
    var html = '<div class="ev-detail" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">';
    html += '<div class="toolbar" style="margin-bottom:10px">' +
      '<button class="btn ghost small" type="button" data-ev-dtab="rsvp" data-ev-id="' + P.esc(ev.id) + '">RSVP list</button>' +
      '<button class="btn ghost small" type="button" data-ev-dtab="att" data-ev-id="' + P.esc(ev.id) + '">Attendance</button>' +
      (ev_isOfficial() ? '<button class="btn ghost small" type="button" data-ev-dtab="avail" data-ev-id="' + P.esc(ev.id) + '">Availability</button>' : "") +
      '<button class="btn ghost small" type="button" data-ev-dtab="duty" data-ev-id="' + P.esc(ev.id) + '">Duty roster</button>' +
      (ev.kind === "show" || ev.kind === "audition" ? '<button class="btn ghost small" type="button" data-ev-dtab="lineup" data-ev-id="' + P.esc(ev.id) + '">Lineup</button>' : "") +
      (ev_isOfficial() ? '<button class="btn ghost small" type="button" data-ev-dtab="notes" data-ev-id="' + P.esc(ev.id) + '">Rehearsal notes</button>' : "") +
      "</div>";
    if (ev_detailTab === "rsvp") html += ev_rsvpListHtml(ev);
    else if (ev_detailTab === "att") html += ev_attendanceHtml(ev);
    else if (ev_detailTab === "avail") html += ev_availHtml(ev);
    else if (ev_detailTab === "duty") html += ev_dutyHtml(ev);
    else if (ev_detailTab === "lineup") html += ev_lineupHtml(ev);
    else if (ev_detailTab === "notes") html += ev_notesHtml(ev);
    return html + "</div>";
  }

  function ev_rsvpListHtml(ev) {
    var groups = { going: [], maybe: [], not_going: [] }, i, r;
    for (i = 0; i < ev_rsvps.length; i++) {
      r = ev_rsvps[i];
      if (r.event_id === ev.id && groups[r.status]) groups[r.status].push(ev_nameOf(r.member_id));
    }
    function names(arr) { return arr.length ? arr.map(P.esc).join(", ") : "—"; }
    return '<p class="muted"><b>Going (' + groups.going.length + "):</b> " + names(groups.going) + "</p>" +
      '<p class="muted"><b>Maybe (' + groups.maybe.length + "):</b> " + names(groups.maybe) + "</p>" +
      '<p class="muted"><b>Not going (' + groups.not_going.length + "):</b> " + names(groups.not_going) + "</p>";
  }

  /* #2/#7/#10 marking; #33 read-only report lives in its own card below. */
  function ev_attendanceHtml(ev) {
    var rows = ev_attRows(ev.id);
    var byMember = {}, i;
    for (i = 0; i < rows.length; i++) byMember[rows[i].member_id] = rows[i];
    var present = 0;
    for (i = 0; i < rows.length; i++) if (rows[i].present) present++;
    var html = '<p class="muted">Marked: ' + rows.length + " &middot; Present: " + present + " &middot; Absent: " + (rows.length - present) + "</p>";
    if (!ev_canMarkAttendance()) {
      html += '<p class="empty">Attendance is marked by the event organisers (Main Admin, Second Admin, President, VP).</p>';
      if (rows.length) {
        html += "<p class=\"muted\">" + rows.map(function (r) {
          return P.esc(ev_nameOf(r.member_id)) + " — " + (r.present ? "Present" : "Absent");
        }).join("<br />") + "</p>";
      }
      return html;
    }
    var members = (P.directory || []).slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    html += '<div class="ev-att-list">';
    for (i = 0; i < members.length; i++) {
      var m = members[i], rec = byMember[m.id];
      var state = rec ? (rec.present ? "present" : "absent") : "unmarked";
      html += '<div class="row-item" style="padding:10px 14px"><div class="body"><b>' + P.esc(m.name || m.login_id || "Member") + '</b> <span class="meta">' + P.esc(P.roleLabel(m.role)) + "</span></div>" +
        '<div class="actions" style="flex-direction:row;gap:6px">' +
        '<button class="btn ghost small" type="button" data-ev-mark="present" data-ev-id="' + P.esc(ev.id) + '" data-ev-member="' + P.esc(m.id) + '"' + (state === "present" ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">Present</button>" +
        '<button class="btn ghost small" type="button" data-ev-mark="absent" data-ev-id="' + P.esc(ev.id) + '" data-ev-member="' + P.esc(m.id) + '"' + (state === "absent" ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">Absent</button>" +
        "</div></div>";
    }
    return html + "</div>";
  }

  /* #17 — officials mark their own availability for this event. */
  function ev_availHtml(ev) {
    var rows = ev_availability.filter(function (r) { return r.event_id === ev.id; });
    var mine = null, i;
    for (i = 0; i < rows.length; i++) if (rows[i].member_id === me.id) mine = rows[i];
    var avail = 0, unavail = 0;
    for (i = 0; i < rows.length; i++) { if (rows[i].available) avail++; else unavail++; }
    var html = '<p class="muted">Available: ' + avail + " &middot; Unavailable: " + unavail + "</p>" +
      '<div class="toolbar" style="margin-bottom:10px">' +
      '<button class="btn ghost small" type="button" data-ev-avail="1" data-ev-id="' + P.esc(ev.id) + '"' + (mine && mine.available ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">I&rsquo;m available</button>" +
      '<button class="btn ghost small" type="button" data-ev-avail="0" data-ev-id="' + P.esc(ev.id) + '"' + (mine && !mine.available ? ' style="border-color:var(--orange);color:var(--orange-deep)"' : "") + ">I&rsquo;m unavailable</button>" +
      "</div><p class=\"muted\">" + rows.map(function (r) {
        return P.esc(ev_nameOf(r.member_id)) + " — " + (r.available ? "Available" : "Unavailable");
      }).join("<br />") + "</p>";
    return html;
  }

  /* #39 read for all officials; #56 edit for Main Admin / President / VP. */
  function ev_dutyHtml(ev) {
    var rows = ev_duties.filter(function (r) { return r.event_id === ev.id; });
    var html = "";
    if (!rows.length) html += '<p class="empty">No duties assigned for this event yet.</p>';
    else html += "<p class=\"muted\">" + rows.map(function (r) {
      return P.esc(ev_nameOf(r.member_id)) + " — <b>" + P.esc(r.duty) + "</b>" +
        (ev_canEditDuty() ? ' <button class="btn ghost small" type="button" data-ev-duty-del="' + P.esc(r.id) + '" data-ev-id="' + P.esc(ev.id) + '">Remove</button>' : "");
    }).join("<br />") + "</p>";
    if (ev_canEditDuty()) {
      var opts = (P.directory || []).map(function (m) {
        return '<option value="' + P.esc(m.id) + '">' + P.esc(m.name || m.login_id || "Member") + " (" + P.esc(P.roleLabel(m.role)) + ")</option>";
      }).join("");
      html += '<form data-ev-duty-form="' + P.esc(ev.id) + '" style="margin-top:10px"><div class="grid2">' +
        '<div><label>Member</label><select data-ev-duty-member>' + opts + "</select></div>" +
        '<div><label>Duty (backstage / music / registration…)</label><input data-ev-duty-text maxlength="80" placeholder="e.g. Backstage" /></div>' +
        '</div><button class="btn small" type="submit">Assign duty</button></form>';
    } else if (!ev_isOfficial()) {
      html += '<p class="empty">The duty roster is visible to officials.</p>';
    }
    return html;
  }

  /* #30 — show lineup planner, Main Admin only. */
  function ev_lineupHtml(ev) {
    var segs = ev_lineup.filter(function (s) { return s.event_id === ev.id; })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
    if (!ev_isMainAdmin()) {
      if (!segs.length) return '<p class="empty">No lineup published for this show yet.</p>';
      return "<ol class=\"ev-lineup\">" + segs.map(function (s) {
        return "<li><b>" + P.esc(s.segment) + "</b>" + (s.music ? ' <span class="muted">— music: ' + P.esc(s.music) + "</span>" : "") + "</li>";
      }).join("") + "</ol>";
    }
    var html = "";
    if (!segs.length) html += '<p class="empty">No segments yet — add the first walk below.</p>';
    html += "<ol class=\"ev-lineup\">" + segs.map(function (s, idx) {
      return "<li><b>" + P.esc(s.segment) + "</b>" + (s.music ? ' <span class="muted">— music: ' + P.esc(s.music) + "</span>" : "") +
        ' <button class="btn ghost small" type="button" data-ev-lineup-up="' + P.esc(s.id) + '" data-ev-id="' + P.esc(ev.id) + '"' + (idx === 0 ? " disabled" : "") + ">↑</button>" +
        ' <button class="btn ghost small" type="button" data-ev-lineup-down="' + P.esc(s.id) + '" data-ev-id="' + P.esc(ev.id) + '"' + (idx === segs.length - 1 ? " disabled" : "") + ">↓</button>" +
        ' <button class="btn ghost small" type="button" data-ev-lineup-del="' + P.esc(s.id) + '" data-ev-id="' + P.esc(ev.id) + '">Remove</button></li>';
    }).join("") + "</ol>";
    html += '<form data-ev-lineup-form="' + P.esc(ev.id) + '" style="margin-top:10px"><div class="grid2">' +
      '<div><label>Segment / walk</label><input data-ev-lineup-segment maxlength="120" placeholder="e.g. Opening walk — Ethnic" /></div>' +
      '<div><label>Music for this segment</label><input data-ev-lineup-music maxlength="120" placeholder="Song / track name" /></div>' +
      '</div><button class="btn small" type="submit">Add segment</button></form>';
    return html;
  }

  /* #58 — shared rehearsal notes, all officials can add. */
  function ev_notesHtml(ev) {
    var rows = ev_notes.filter(function (n) { return n.event_id === ev.id; });
    var html = "";
    if (!rows.length) html += '<p class="empty">No rehearsal notes yet.</p>';
    else html += rows.map(function (n) {
      return '<div class="row-item" style="padding:12px 16px"><div class="body"><b>' + P.esc(ev_nameOf(n.created_by)) + '</b><span class="meta">' + P.esc(P.timeAgo(n.created_at)) + '</span><p>' + P.esc(n.body) + "</p></div></div>";
    }).join("");
    if (ev_isOfficial()) {
      html += '<form data-ev-note-form="' + P.esc(ev.id) + '" style="margin-top:10px">' +
        '<label>Add a rehearsal note</label><textarea data-ev-note-body maxlength="2000" placeholder="Steps, music cues, costume notes…"></textarea>' +
        '<button class="btn small" type="submit">Add note</button></form>';
    }
    return html;
  }

  /* ---------- calendar (#15, #18) ---------- */
  function ev_renderCalendar() {
    var box = ev_el("ev_calList");
    if (!box) return;
    var items = [];
    ev_events.forEach(function (e) {
      items.push({ when: e.starts_at, kind: e.kind || "event", label: e.title, sub: e.venue || "", id: e.id });
    });
    ev_tasks.forEach(function (t) {
      if (!t.due_date) return;
      items.push({ when: t.due_date, kind: "deadline", label: "Deadline: " + t.title, sub: t.assignee_id === me.id ? "Assigned to you" : "Task", id: null });
    });
    items.sort(function (a, b) { return new Date(a.when) - new Date(b.when); });
    if (!items.length) { box.innerHTML = '<p class="empty">Nothing on the calendar yet.</p>'; return; }
    box.innerHTML = items.map(function (it) {
      return '<div class="row-item" style="padding:12px 16px"><div class="body"><b>' + P.esc(it.label) + '</b> <span class="chip ghost">' + P.esc(it.kind) + '</span>' +
        '<div class="meta">' + P.esc(ev_fmtDate(it.when)) + (it.sub ? " &middot; " + P.esc(it.sub) : "") + "</div></div>" +
        (it.id ? '<div class="actions"><button class="btn ghost small" type="button" data-ev-goto="' + P.esc(it.id) + '" data-ev-id="' + P.esc(it.id) + '">Open event</button></div>' : "") +
        "</div>";
    }).join("");
  }

  /* ---------- attendance reports, read-only (#33) ---------- */
  function ev_renderReports() {
    var box = ev_el("ev_reportList");
    if (!box) return;
    var wrap = ev_el("ev_reportsCard");
    /* Visible to Second Admin and anyone privileged; members do not see it. */
    var canSee = me.role === "second_admin" || P.isPrivileged();
    if (wrap) wrap.hidden = !canSee;
    if (!canSee) return;
    if (!ev_events.length) { box.innerHTML = '<p class="empty">No events yet.</p>'; return; }
    var sorted = ev_events.slice().sort(function (a, b) { return new Date(b.starts_at) - new Date(a.starts_at); });
    box.innerHTML = sorted.map(function (e) {
      var rows = ev_attRows(e.id), present = 0, i;
      for (i = 0; i < rows.length; i++) if (rows[i].present) present++;
      var pct = rows.length ? Math.round(present * 100 / rows.length) : null;
      return '<div class="row-item" style="padding:12px 16px"><div class="body"><b>' + P.esc(e.title) + '</b>' +
        '<div class="meta">' + P.esc(ev_fmtDate(e.starts_at)) + "</div>" +
        '<p class="muted">Marked ' + rows.length + " &middot; Present " + present + " &middot; Absent " + (rows.length - present) +
        (pct === null ? " &middot; No attendance marked yet" : " &middot; " + pct + "% present") + "</p></div></div>";
    }).join("") + '<p class="muted">Read-only — attendance is marked from the event itself by the organisers.</p>';
  }

  /* ---------- room bookings (#46 / #53) ---------- */
  function ev_renderRooms() {
    var wrap = ev_el("ev_roomCard");
    if (wrap) wrap.hidden = !ev_canBookRoom();
    var box = ev_el("ev_roomList");
    if (!box) return;
    if (!ev_rooms.length) { box.innerHTML = '<p class="empty">No room bookings yet.</p>'; return; }
    box.innerHTML = ev_rooms.map(function (b) {
      return '<div class="row-item" style="padding:12px 16px"><div class="body"><b>' + P.esc(b.room) + '</b> <span class="chip ghost">' + P.esc(b.purpose || "Rehearsal") + '</span>' +
        '<div class="meta">' + P.esc(ev_fmt(b.starts_at)) + " – " + P.esc(ev_fmt(b.ends_at)) + "</div>" +
        '<p class="muted">Booked by ' + P.esc(ev_nameOf(b.booked_by)) + "</p></div>" +
        (ev_canBookRoom() ? '<div class="actions"><button class="btn ghost small" type="button" data-ev-room-del="' + P.esc(b.id) + '">Cancel</button></div>' : "") +
        "</div>";
    }).join("");
  }
  function ev_roomClash(room, startISO, endISO) {
    var s = new Date(startISO).getTime(), e = new Date(endISO).getTime(), i, b;
    for (i = 0; i < ev_rooms.length; i++) {
      b = ev_rooms[i];
      if (b.room !== room) continue;
      var bs = new Date(b.starts_at).getTime(), be = new Date(b.ends_at).getTime();
      if (s < be && e > bs) return b;
    }
    return null;
  }

  /* ---------- show video archive (#54) ---------- */
  function ev_renderVideos() {
    var box = ev_el("ev_videoList");
    if (!box) return;
    var form = ev_el("ev_videoForm");
    if (form) form.hidden = !ev_canManageVideos();
    if (!ev_videos.length) {
      box.innerHTML = '<p class="empty">No show videos in the archive yet.</p>';
      return;
    }
    var byYear = {}, years = [], i, v;
    for (i = 0; i < ev_videos.length; i++) {
      v = ev_videos[i];
      (byYear[v.year] = byYear[v.year] || []).push(v);
    }
    years = Object.keys(byYear).sort(function (a, b) { return b - a; });
    var html = "";
    years.forEach(function (y) {
      html += '<h3 class="ev-year">' + P.esc(String(y)) + "</h3>";
      byYear[y].forEach(function (vid) {
        html += '<div class="row-item" style="padding:12px 16px"><div class="body"><b>' + P.esc(vid.title) + '</b>' +
          '<div class="meta">' + P.esc(vid.show_name || "") + " &middot; " + P.esc(String(vid.year)) + "</div></div>" +
          '<div class="actions"><a class="btn ghost small" href="' + P.esc(vid.url) + '" target="_blank" rel="noopener">Watch</a>' +
          (ev_canManageVideos() ? ' <button class="btn ghost small" type="button" data-ev-video-del="' + P.esc(vid.id) + '">Remove</button>' : "") +
          "</div></div>";
      });
    });
    box.innerHTML = html;
  }

  /* ---------- dashboard cards (#64, #21, #85) ---------- */
  function ev_renderCountdown() {
    var box = ev_el("ev_countdownBody");
    if (!box) return;
    var next = ev_nextEvent();
    if (!next) { box.innerHTML = '<p class="empty">No upcoming event scheduled.</p>'; return; }
    var diff = new Date(next.starts_at).getTime() - Date.now();
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor(diff % 86400000 / 3600000);
    var mins = Math.floor(diff % 3600000 / 60000);
    box.innerHTML = '<div class="ev-count"><b>' + days + '</b><span>days</span><b>' + hours + '</b><span>hrs</span><b>' + mins + '</b><span>min</span></div>' +
      '<p class="muted" style="margin-top:8px">' + P.esc(next.title) + " — " + P.esc(ev_fmt(next.starts_at)) + (next.venue ? " &middot; " + P.esc(next.venue) : "") + "</p>";
  }
  function ev_renderMyAttendance() {
    var box = ev_el("ev_myAttBody");
    if (!box) return;
    var pct = ev_attPctFor(me.id);
    var rows = ev_attendance.filter(function (r) { return r.member_id === me.id; });
    var present = 0, i;
    for (i = 0; i < rows.length; i++) if (rows[i].present) present++;
    if (pct === null) { box.innerHTML = '<p class="empty">No attendance marked for you yet.</p>'; return; }
    box.innerHTML = '<div class="stat"><b>' + pct + '%</b><span>Attendance</span></div>' +
      '<p class="muted" style="margin-top:8px">Present at ' + present + " of " + rows.length + " marked events / rehearsals.</p>";
  }
  function ev_renderWeek() {
    var box = ev_el("ev_weekBody");
    if (!box) return;
    var now = Date.now(), weekEnd = now + 7 * 86400000;
    var items = [];
    ev_events.forEach(function (e) {
      var t = new Date(e.starts_at).getTime();
      if (!isNaN(t) && t >= now && t <= weekEnd)
        items.push({ when: e.starts_at, label: e.title, kind: e.kind || "event" });
    });
    ev_tasks.forEach(function (t) {
      if (t.assignee_id !== me.id || !t.due_date || t.status === "done") return;
      var d = new Date(t.due_date).getTime();
      if (!isNaN(d) && d >= now && d <= weekEnd)
        items.push({ when: t.due_date, label: "Task: " + t.title, kind: "task" });
    });
    items.sort(function (a, b) { return new Date(a.when) - new Date(b.when); });
    if (!items.length) { box.innerHTML = '<p class="empty">Nothing on your calendar this week.</p>'; return; }
    box.innerHTML = items.map(function (it) {
      return '<div class="row-item" style="padding:10px 14px"><div class="body"><b>' + P.esc(it.label) + '</b> <span class="chip ghost">' + P.esc(it.kind) + '</span>' +
        '<div class="meta">' + P.esc(ev_fmtDate(it.when)) + "</div></div></div>";
    }).join("");
  }
  function ev_renderDashboard() {
    ev_renderCountdown();
    ev_renderMyAttendance();
    ev_renderWeek();
  }

  function ev_renderAll() {
    ev_renderEvents();
    ev_renderCalendar();
    ev_renderReports();
    ev_renderRooms();
    ev_renderVideos();
    ev_renderDashboard();
  }

  /* ---------- actions ---------- */
  async function ev_refresh() {
    await ev_loadAll();
    ev_renderAll();
  }

  async function ev_setRsvp(eventId, status) {
    var existing = null, i;
    for (i = 0; i < ev_rsvps.length; i++)
      if (ev_rsvps[i].event_id === eventId && ev_rsvps[i].member_id === me.id) existing = ev_rsvps[i];
    var res;
    if (existing) res = await P.client.from("event_rsvps").update({ status: status }).eq("id", existing.id);
    else res = await P.client.from("event_rsvps").insert({ event_id: eventId, member_id: me.id, status: status });
    if (res.error) { P.showMsg(ev_el("ev_eventMsg"), "Could not save your RSVP: " + res.error.message); return; }
    await ev_refresh();
  }

  async function ev_markAttendance(eventId, memberId, present) {
    var existing = null, i;
    for (i = 0; i < ev_attendance.length; i++)
      if (ev_attendance[i].event_id === eventId && ev_attendance[i].member_id === memberId) existing = ev_attendance[i];
    var res;
    if (existing) res = await P.client.from("attendance").update({ present: present, marked_by: me.id }).eq("id", existing.id);
    else res = await P.client.from("attendance").insert({ event_id: eventId, member_id: memberId, present: present, marked_by: me.id });
    if (res.error) { P.showMsg(ev_el("ev_eventMsg"), "Could not mark attendance: " + res.error.message); return; }
    await ev_refresh();
  }

  async function ev_setAvailability(eventId, available) {
    var existing = null, i;
    for (i = 0; i < ev_availability.length; i++)
      if (ev_availability[i].event_id === eventId && ev_availability[i].member_id === me.id) existing = ev_availability[i];
    var res;
    if (existing) res = await P.client.from("availability").update({ available: available }).eq("id", existing.id);
    else res = await P.client.from("availability").insert({ event_id: eventId, member_id: me.id, available: available });
    if (res.error) { P.showMsg(ev_el("ev_eventMsg"), "Could not save availability: " + res.error.message); return; }
    await ev_refresh();
  }

  function ev_prefillForm(ev) {
    var f = ev_el("ev_eventForm");
    if (!f) return;
    ev_el("ev_evTitle").value = ev ? "Copy of " + ev.title : "";
    ev_el("ev_evKind").value = ev ? ev.kind : "show";
    ev_el("ev_evStart").value = "";
    ev_el("ev_evEnd").value = "";
    ev_el("ev_evVenue").value = ev ? (ev.venue || "") : "";
    ev_el("ev_evDesc").value = ev ? (ev.description || "") : "";
    if (ev_el("ev_evPoster")) ev_el("ev_evPoster").value = "";
    f.scrollIntoView({ behavior: "smooth", block: "start" });
    ev_el("ev_evTitle").focus();
  }

  /* ---------- wiring ---------- */
  function ev_wire() {
    var form = ev_el("ev_eventForm");
    if (form) {
      form.hidden = !ev_canCreateEvent();
      var createCard = ev_el("ev_createCard");
      if (createCard) createCard.hidden = !ev_canCreateEvent();
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var msg = ev_el("ev_eventMsg");
        P.hideMsg(msg);
        var title = ev_el("ev_evTitle").value.trim();
        var startISO = ev_toISO(ev_el("ev_evStart").value);
        var endISO = ev_toISO(ev_el("ev_evEnd").value);
        if (!title) { P.showMsg(msg, "Give the event a title."); return; }
        if (!startISO) { P.showMsg(msg, "Pick a start date and time."); return; }
        if (endISO && endISO < startISO) { P.showMsg(msg, "The end time is before the start time."); return; }
        var btn = ev_el("ev_evSaveBtn");
        btn.disabled = true;
        var res = await P.client.from("events").insert({
          title: title,
          kind: ev_el("ev_evKind").value,
          starts_at: startISO,
          ends_at: endISO,
          venue: ev_el("ev_evVenue").value.trim() || null,
          description: ev_el("ev_evDesc").value.trim() || null,
          created_by: me.id
        }).select("id").single();
        if (res.error) {
          btn.disabled = false;
          P.showMsg(msg, "Could not create the event: " + res.error.message);
          return;
        }
        var file = ev_el("ev_evPoster") && ev_el("ev_evPoster").files[0];
        if (file) {
          if (file.type && file.type.indexOf("image/") !== 0) {
            P.showMsg(msg, "Event created, but the poster was not an image — pick a JPG, PNG or WebP poster next time.");
          } else {
            var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
            var path = "events/" + res.data.id + "/poster." + ext;
            var up = await P.client.storage.from("club-files").upload(path, file, { upsert: true, contentType: file.type });
            if (up.error) {
              P.showMsg(msg, "Event created, but the poster upload failed: " + up.error.message);
            } else {
              var pub = P.client.storage.from("club-files").getPublicUrl(path);
              var url = pub.data ? pub.data.publicUrl : null;
              if (url) await P.client.from("events").update({ poster_url: url }).eq("id", res.data.id);
            }
          }
        }
        btn.disabled = false;
        form.reset();
        P.showMsg(msg, "Event created.", "ok");
        await ev_refresh();
      });
    }

    var roomForm = ev_el("ev_roomForm");
    if (roomForm) {
      roomForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var msg = ev_el("ev_roomMsg");
        P.hideMsg(msg);
        var room = ev_el("ev_roomName").value.trim();
        var startISO = ev_toISO(ev_el("ev_roomStart").value);
        var endISO = ev_toISO(ev_el("ev_roomEnd").value);
        if (!room) { P.showMsg(msg, "Name the room."); return; }
        if (!startISO || !endISO) { P.showMsg(msg, "Pick a start and end time."); return; }
        if (endISO <= startISO) { P.showMsg(msg, "The end time must be after the start time."); return; }
        var clash = ev_roomClash(room, startISO, endISO);
        if (clash) {
          P.showMsg(msg, "Clash: " + room + " is already booked " + ev_fmt(clash.starts_at) + " – " + ev_fmt(clash.ends_at) + " (" + (clash.purpose || "rehearsal") + "). Pick another time.");
          return;
        }
        var res = await P.client.from("room_bookings").insert({
          room: room,
          starts_at: startISO,
          ends_at: endISO,
          purpose: ev_el("ev_roomPurpose").value.trim() || "Rehearsal",
          booked_by: me.id
        });
        if (res.error) { P.showMsg(msg, "Could not book the room: " + res.error.message); return; }
        roomForm.reset();
        P.showMsg(msg, "Room booked.", "ok");
        await ev_refresh();
      });
    }

    var videoForm = ev_el("ev_videoForm");
    if (videoForm) {
      videoForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var msg = ev_el("ev_videoMsg");
        P.hideMsg(msg);
        var title = ev_el("ev_videoTitle").value.trim();
        var url = ev_el("ev_videoUrl").value.trim();
        var year = parseInt(ev_el("ev_videoYear").value, 10);
        if (!title || !url) { P.showMsg(msg, "Give the video a title and a link."); return; }
        if (!/^https?:\/\//i.test(url)) { P.showMsg(msg, "The video link must start with http:// or https://."); return; }
        if (!year || year < 2000 || year > 2100) { P.showMsg(msg, "Enter a valid year."); return; }
        var res = await P.client.from("show_videos").insert({
          title: title,
          show_name: ev_el("ev_videoShow").value.trim() || null,
          year: year,
          url: url
        });
        if (res.error) { P.showMsg(msg, "Could not add the video: " + res.error.message); return; }
        videoForm.reset();
        P.showMsg(msg, "Video added to the archive.", "ok");
        await ev_refresh();
      });
    }

    /* Delegated clicks inside the events tab (RSVP, details, attendance,
       availability, duties, lineup, notes, duplicate, deletes). */
    var tab = ev_el("tab-events");
    if (tab) {
      tab.addEventListener("click", async function (e) {
        var t = e.target;
        while (t && t !== tab && !t.getAttribute("data-ev-rsvp") && !t.getAttribute("data-ev-detail") &&
          !t.getAttribute("data-ev-dtab") && !t.getAttribute("data-ev-mark") && !t.getAttribute("data-ev-avail") &&
          !t.getAttribute("data-ev-dup") && !t.getAttribute("data-ev-goto") && !t.getAttribute("data-ev-duty-del") &&
          !t.getAttribute("data-ev-lineup-up") && !t.getAttribute("data-ev-lineup-down") && !t.getAttribute("data-ev-lineup-del") &&
          !t.getAttribute("data-ev-room-del") && !t.getAttribute("data-ev-video-del")) t = t.parentNode;
        if (!t || t === tab) return;
        var id = t.getAttribute("data-ev-id");
        var msg = ev_el("ev_eventMsg");
        if (t.getAttribute("data-ev-rsvp")) { await ev_setRsvp(id, t.getAttribute("data-ev-rsvp")); return; }
        if (t.getAttribute("data-ev-mark")) {
          await ev_markAttendance(id, t.getAttribute("data-ev-member"), t.getAttribute("data-ev-mark") === "present");
          return;
        }
        if (t.getAttribute("data-ev-avail")) { await ev_setAvailability(id, t.getAttribute("data-ev-avail") === "1"); return; }
        if (t.getAttribute("data-ev-detail")) {
          ev_openEvent = ev_openEvent === id ? null : id;
          ev_detailTab = "rsvp";
          ev_renderEvents();
          return;
        }
        if (t.getAttribute("data-ev-dtab")) { ev_detailTab = t.getAttribute("data-ev-dtab"); ev_renderEvents(); return; }
        if (t.getAttribute("data-ev-goto")) {
          ev_openEvent = id; ev_detailTab = "rsvp"; ev_renderEvents();
          var list = ev_el("ev_eventList");
          if (list) list.scrollIntoView({ behavior: "smooth" });
          return;
        }
        if (t.getAttribute("data-ev-dup")) {
          var src = null, i;
          for (i = 0; i < ev_events.length; i++) if (ev_events[i].id === id) src = ev_events[i];
          if (src) { ev_prefillForm(src); P.showMsg(msg, "Copied “" + src.title + "” — set the new date and time, then save.", "ok"); }
          return;
        }
        if (t.getAttribute("data-ev-duty-del")) {
          var dr = await P.client.from("duty_roster").delete().eq("id", t.getAttribute("data-ev-duty-del"));
          if (dr.error) P.showMsg(msg, "Could not remove the duty: " + dr.error.message);
          else await ev_refresh();
          return;
        }
        if (t.getAttribute("data-ev-room-del")) {
          var rr = await P.client.from("room_bookings").delete().eq("id", t.getAttribute("data-ev-room-del"));
          if (rr.error) P.showMsg(msg, "Could not cancel the booking: " + rr.error.message);
          else await ev_refresh();
          return;
        }
        if (t.getAttribute("data-ev-video-del")) {
          var vr = await P.client.from("show_videos").delete().eq("id", t.getAttribute("data-ev-video-del"));
          if (vr.error) P.showMsg(msg, "Could not remove the video: " + vr.error.message);
          else await ev_refresh();
          return;
        }
        if (t.getAttribute("data-ev-lineup-del")) {
          var lr = await P.client.from("lineup_segments").delete().eq("id", t.getAttribute("data-ev-lineup-del"));
          if (lr.error) P.showMsg(msg, "Could not remove the segment: " + lr.error.message);
          else await ev_refresh();
          return;
        }
        if (t.getAttribute("data-ev-lineup-up") || t.getAttribute("data-ev-lineup-down")) {
          var segId = t.getAttribute("data-ev-lineup-up") || t.getAttribute("data-ev-lineup-down");
          var up = !!t.getAttribute("data-ev-lineup-up");
          var segs = ev_lineup.filter(function (s) { return s.event_id === id; })
            .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
          var idx = -1, j;
          for (j = 0; j < segs.length; j++) if (segs[j].id === segId) idx = j;
          var swap = up ? idx - 1 : idx + 1;
          if (idx < 0 || swap < 0 || swap >= segs.length) return;
          var a = segs[idx], b = segs[swap];
          await P.client.from("lineup_segments").update({ position: b.position }).eq("id", a.id);
          await P.client.from("lineup_segments").update({ position: a.position }).eq("id", b.id);
          await ev_refresh();
          return;
        }
      });

      /* Delegated submits for the per-event duty / lineup / note forms. */
      tab.addEventListener("submit", async function (e) {
        var f = e.target;
        var msg = ev_el("ev_eventMsg");
        if (f.getAttribute("data-ev-duty-form")) {
          e.preventDefault();
          var memberSel = f.querySelector("[data-ev-duty-member]");
          var dutyInput = f.querySelector("[data-ev-duty-text]");
          var duty = dutyInput.value.trim();
          if (!duty) { P.showMsg(msg, "Say what the duty is (e.g. Backstage)."); return; }
          var res = await P.client.from("duty_roster").insert({
            event_id: f.getAttribute("data-ev-duty-form"),
            member_id: memberSel.value,
            duty: duty
          });
          if (res.error) { P.showMsg(msg, "Could not assign the duty: " + res.error.message); return; }
          await ev_refresh();
          return;
        }
        if (f.getAttribute("data-ev-lineup-form")) {
          e.preventDefault();
          var segInput = f.querySelector("[data-ev-lineup-segment]");
          var musicInput = f.querySelector("[data-ev-lineup-music]");
          var segment = segInput.value.trim();
          if (!segment) { P.showMsg(msg, "Name the segment or walk."); return; }
          var evId = f.getAttribute("data-ev-lineup-form");
          var existing = ev_lineup.filter(function (s) { return s.event_id === evId; });
          var maxPos = 0, k;
          for (k = 0; k < existing.length; k++) maxPos = Math.max(maxPos, existing[k].position || 0);
          var lr2 = await P.client.from("lineup_segments").insert({
            event_id: evId,
            position: maxPos + 1,
            segment: segment,
            music: musicInput.value.trim() || null
          });
          if (lr2.error) { P.showMsg(msg, "Could not add the segment: " + lr2.error.message); return; }
          await ev_refresh();
          return;
        }
        if (f.getAttribute("data-ev-note-form")) {
          e.preventDefault();
          var bodyInput = f.querySelector("[data-ev-note-body]");
          var body = bodyInput.value.trim();
          if (!body) { P.showMsg(msg, "Write the note first."); return; }
          var nr = await P.client.from("rehearsal_notes").insert({
            event_id: f.getAttribute("data-ev-note-form"),
            body: body,
            created_by: me.id
          });
          if (nr.error) { P.showMsg(msg, "Could not add the note: " + nr.error.message); return; }
          await ev_refresh();
          return;
        }
      });
    }
  }

  ev_wire();
  ev_loadAll().then(function () {
    ev_renderAll();
    if (ev_countdownTimer) clearInterval(ev_countdownTimer);
    ev_countdownTimer = setInterval(ev_renderCountdown, 60000);
  });
}



/* ================= finance/finance.js ================= */

/* REVA Fashion Club portal — Step 16 finance package (#3, #4, #5, #36,
   #43, #45, #52, #55, #71). Called by the master __f91Init as
   f91InitFinance(window.Portal91). Uses only the Portal91 bridge (P)
   and the tables in the Step 16 contract. Plain ES5. */
function f91InitFinance(P) {
  var fin_fees = [];
  var fin_budget = [];
  var fin_sponsors = [];
  var fin_merch = [];
  var fin_year = "";
  var fin_editingSponsor = null;
  var fin_emailAddrs = [];

  /* ---------- small helpers ---------- */
  function fin_money(n) {
    var v = Number(n);
    if (isNaN(v)) v = 0;
    return "\u20B9" + v.toLocaleString("en-IN");
  }
  function fin_today() {
    var d = new Date();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function fin_isPresVP() {
    return P.me && (P.me.role === "president" || P.me.role === "vice_president");
  }
  function fin_canApproveMerch() {
    return P.isMainAdmin() || fin_isPresVP();
  }
  function fin_canSeeFees() {
    return P.isMainAdmin() || fin_isPresVP();
  }
  function fin_allMembers() {
    var rows = (P.adminRows && P.adminRows.length) ? P.adminRows : P.directory;
    return (rows || []).slice().sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }
  function fin_member(id) {
    var byId = P.directoryById || {};
    var m = byId[id];
    if (m) return m;
    var rows = P.adminRows || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }
  function fin_memberName(id) {
    var m = fin_member(id);
    return m ? (m.name || "…") : "…";
  }
  function fin_feeFor(memberId, year) {
    for (var i = 0; i < fin_fees.length; i++) {
      if (fin_fees[i].member_id === memberId && String(fin_fees[i].year) === String(year)) return fin_fees[i];
    }
    return null;
  }
  function fin_pendingMembers() {
    var out = [];
    fin_allMembers().forEach(function (m) {
      var f = fin_feeFor(m.id, fin_year);
      if (!f || !f.paid) out.push({ member: m, fee: f });
    });
    return out;
  }
  function fin_statusChip(text, orange) {
    return '<span class="chip' + (orange ? " orange" : "") + '">' + P.esc(text) + "</span>";
  }

  /* ---------- loading ---------- */
  async function fin_loadYear() {
    var res = await P.client.rpc("get_club_year");
    if (!res.error && res.data) fin_year = String(res.data);
    else fin_year = String(new Date().getFullYear());
  }
  async function fin_loadFees() {
    var res = await P.client.from("fees").select("*").order("year", { ascending: false });
    if (!res.error) fin_fees = res.data || [];
  }
  async function fin_loadBudget() {
    var res = await P.client.from("budget_entries").select("*").order("entry_date", { ascending: false });
    if (!res.error) fin_budget = res.data || [];
  }
  async function fin_loadSponsors() {
    var res = await P.client.from("sponsors").select("*").order("name", { ascending: true });
    if (!res.error) fin_sponsors = res.data || [];
  }
  async function fin_loadMerch() {
    var res = await P.client.from("merch_orders").select("*");
    if (!res.error) fin_merch = res.data || [];
  }
  async function fin_loadAll() {
    await fin_loadFees();
    await fin_loadBudget();
    await fin_loadSponsors();
    await fin_loadMerch();
    fin_renderAll();
  }
  function fin_renderAll() {
    fin_renderFees();
    fin_renderBudget();
    fin_renderSponsors();
    fin_renderMerch();
    fin_renderMyFee();
    fin_renderEmail();
  }

  /* ---------- #3 fees & dues / #36 pending list (read-only for Pres/VP) ---------- */
  function fin_renderFees() {
    var yearEl = P.$("fin_feeYearLabel");
    if (yearEl) yearEl.textContent = fin_year || "…";
    var pendEl = P.$("fin_pendingList");
    var paidEl = P.$("fin_paidList");
    if (!pendEl && !paidEl) return;
    var isMA = P.isMainAdmin();
    var pending = fin_pendingMembers();
    var paid = [];
    fin_allMembers().forEach(function (m) {
      var f = fin_feeFor(m.id, fin_year);
      if (f && f.paid) paid.push({ member: m, fee: f });
    });
    var cntEl = P.$("fin_pendingCount");
    if (cntEl) cntEl.textContent = pending.length + (pending.length === 1 ? " member has not paid" : " members have not paid") + " for " + fin_year + ".";
    var remindBtn = P.$("fin_remindBtn");
    if (remindBtn) remindBtn.style.display = isMA ? "" : "none";
    if (pendEl) {
      if (!pending.length) {
        pendEl.innerHTML = '<p class="empty">Everyone has paid for ' + P.esc(fin_year) + ".</p>";
      } else {
        pendEl.innerHTML = pending.map(function (p) {
          var f = p.fee;
          var amount = f && f.amount != null ? fin_money(f.amount) : "amount not recorded yet";
          return '<div class="row-item">' + P.avatarHtml(p.member) +
            '<div class="body"><b>' + P.esc(p.member.name || "…") + "</b> " +
            fin_statusChip("Pending", true) +
            '<div class="meta">' + P.esc(amount) + " &middot; " + P.esc(fin_year) +
            (f && f.note ? " &middot; " + P.esc(f.note) : "") + "</div></div>" +
            '<div class="actions">' +
            (isMA ? '<button class="btn ghost small" type="button" data-fin-fee-paid="' + P.esc(p.member.id) + '">Mark paid</button>' : "") +
            "</div></div>";
        }).join("");
      }
    }
    if (paidEl) {
      if (!paid.length) {
        paidEl.innerHTML = "<p class=\"empty\">Nobody has paid yet for " + P.esc(fin_year) + ".</p>";
      } else {
        paidEl.innerHTML = paid.map(function (p) {
          var f = p.fee;
          return '<div class="row-item">' + P.avatarHtml(p.member) +
            '<div class="body"><b>' + P.esc(p.member.name || "…") + "</b> " +
            fin_statusChip("Paid", false) +
            '<div class="meta">' + P.esc(fin_money(f.amount)) + " &middot; " +
            (f.paid_at ? P.esc(P.timeAgo(f.paid_at)) : P.esc(fin_year)) +
            (f.note ? " &middot; " + P.esc(f.note) : "") + "</div></div>" +
            '<div class="actions">' +
            (isMA ? '<button class="btn ghost small" type="button" data-fin-fee-unpaid="' + P.esc(f.id) + '">Mark unpaid</button>' +
            '<button class="btn ghost small" type="button" data-fin-fee-del="' + P.esc(f.id) + '">Delete</button>' : "") +
            "</div></div>";
        }).join("");
      }
    }
  }

  async function fin_saveFee(e) {
    e.preventDefault();
    if (!P.isMainAdmin()) return;
    var msg = P.$("fin_feeMsg");
    P.hideMsg(msg);
    var memberId = P.$("fin_feeMember").value;
    var year = P.$("fin_feeYear").value.trim();
    var amount = Number(P.$("fin_feeAmount").value);
    var paid = P.$("fin_feePaid").checked;
    var paidAt = P.$("fin_feePaidAt").value || null;
    var note = P.$("fin_feeNote").value.trim() || null;
    if (!memberId) { P.showMsg(msg, "Pick a member first."); return; }
    if (!year) { P.showMsg(msg, "Enter the club year."); return; }
    if (isNaN(amount) || amount < 0) { P.showMsg(msg, "Enter a valid amount."); return; }
    var row = { member_id: memberId, year: year, amount: amount, paid: paid, paid_at: paid ? (paidAt || fin_today()) : null, note: note };
    var existing = fin_feeFor(memberId, year);
    var res = existing
      ? await P.client.from("fees").update(row).eq("id", existing.id)
      : await P.client.from("fees").insert(row);
    if (res.error) { P.showMsg(msg, "Could not save: " + res.error.message); return; }
    P.$("fin_feeNote").value = "";
    await fin_loadFees();
    fin_renderFees();
    fin_renderMyFee();
    fin_renderEmail();
    P.showMsg(msg, "Fee record saved.", "ok");
  }

  async function fin_remindUnpaid() {
    if (!P.isMainAdmin()) return;
    var pending = fin_pendingMembers();
    if (!pending.length) { P.showMsg(P.$("fin_feeMsg"), "Nobody is unpaid — nothing to remind.", "ok"); return; }
    if (!window.confirm("Send a fee reminder to all " + pending.length + " unpaid members? Each one gets their own direct message.")) return;
    var btn = P.$("fin_remindBtn");
    btn.disabled = true;
    var rows = pending.map(function (p) {
      var amount = p.fee && p.fee.amount != null ? fin_money(p.fee.amount) : "the membership fee";
      return {
        sender_id: P.me.id, recipient_id: p.member.id, kind: "dm",
        subject: "Membership fee reminder",
        body: "Hi " + (p.member.name || "") + ", this is a reminder that your REVA Fashion Club membership fee for " + fin_year + " (" + amount + ") is still pending. Please pay it at the next rehearsal, or message the Main Admin if you have already paid. — Team Narcissa"
      };
    });
    var res = await P.client.from("messages").insert(rows);
    btn.disabled = false;
    if (res.error) { P.showMsg(P.$("fin_feeMsg"), "Could not send the reminders: " + res.error.message); return; }
    P.showMsg(P.$("fin_feeMsg"), "Fee reminder sent to " + pending.length + " member" + (pending.length === 1 ? "." : "s."), "ok");
    if (P.refreshInbox) P.refreshInbox();
  }

  function fin_wireFeeActions() {
    var pendEl = P.$("fin_pendingList");
    if (pendEl) pendEl.addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-fin-fee-paid]");
      if (!btn || !P.isMainAdmin()) return;
      var memberId = btn.getAttribute("data-fin-fee-paid");
      var existing = fin_feeFor(memberId, fin_year);
      var res = existing
        ? await P.client.from("fees").update({ paid: true, paid_at: fin_today() }).eq("id", existing.id)
        : await P.client.from("fees").insert({ member_id: memberId, year: fin_year, amount: 0, paid: true, paid_at: fin_today(), note: null });
      if (res.error) { P.showMsg(P.$("fin_feeMsg"), "Could not mark paid: " + res.error.message); return; }
      await fin_loadFees(); fin_renderFees(); fin_renderMyFee(); fin_renderEmail();
    });
    var paidEl = P.$("fin_paidList");
    if (paidEl) paidEl.addEventListener("click", async function (e) {
      var unBtn = e.target.closest("[data-fin-fee-unpaid]");
      var delBtn = e.target.closest("[data-fin-fee-del]");
      if (!P.isMainAdmin()) return;
      if (unBtn) {
        var r1 = await P.client.from("fees").update({ paid: false, paid_at: null }).eq("id", unBtn.getAttribute("data-fin-fee-unpaid"));
        if (r1.error) { P.showMsg(P.$("fin_feeMsg"), "Could not update: " + r1.error.message); return; }
        await fin_loadFees(); fin_renderFees(); fin_renderMyFee(); fin_renderEmail();
      } else if (delBtn) {
        if (!window.confirm("Delete this fee record?")) return;
        var r2 = await P.client.from("fees").delete().eq("id", delBtn.getAttribute("data-fin-fee-del"));
        if (r2.error) { P.showMsg(P.$("fin_feeMsg"), "Could not delete: " + r2.error.message); return; }
        await fin_loadFees(); fin_renderFees(); fin_renderMyFee(); fin_renderEmail();
      }
    });
  }

  /* ---------- #4 budget tracker ---------- */
  function fin_renderBudget() {
    var listEl = P.$("fin_budgetList");
    if (!listEl) return;
    var income = 0, expense = 0;
    fin_budget.forEach(function (b) {
      if (b.kind === "income") income += Number(b.amount) || 0;
      else if (b.kind === "expense") expense += Number(b.amount) || 0;
    });
    var balEl = P.$("fin_budgetBalance");
    if (balEl) { balEl.textContent = fin_money(income - expense); balEl.className = (income - expense) < 0 ? "fin-negative" : ""; }
    var incEl = P.$("fin_budgetIncome");
    if (incEl) incEl.textContent = fin_money(income);
    var expEl = P.$("fin_budgetExpense");
    if (expEl) expEl.textContent = fin_money(expense);
    if (!fin_budget.length) {
      listEl.innerHTML = "<p class=\"empty\">No budget entries yet.</p>";
      return;
    }
    listEl.innerHTML = fin_budget.map(function (b) {
      var isInc = b.kind === "income";
      return '<div class="row-item"><div class="body"><b>' + P.esc(b.label || "…") + "</b> " +
        fin_statusChip(isInc ? "Income" : "Expense", !isInc) +
        '<div class="meta">' + P.esc(fin_money(b.amount)) + " &middot; " + P.esc(b.entry_date || "") +
        (b.note ? " &middot; " + P.esc(b.note) : "") + "</div></div>" +
        '<div class="actions"><button class="btn ghost small" type="button" data-fin-budget-del="' + P.esc(b.id) + '">Delete</button></div></div>';
    }).join("");
  }

  async function fin_saveBudget(e) {
    e.preventDefault();
    if (!P.isMainAdmin()) return;
    var msg = P.$("fin_budgetMsg");
    P.hideMsg(msg);
    var label = P.$("fin_budgetLabel").value.trim();
    var amount = Number(P.$("fin_budgetAmount").value);
    var date = P.$("fin_budgetDate").value;
    var note = P.$("fin_budgetNote").value.trim() || null;
    if (!label) { P.showMsg(msg, "Give the entry a label."); return; }
    if (isNaN(amount) || amount < 0) { P.showMsg(msg, "Enter a valid amount."); return; }
    if (!date) { P.showMsg(msg, "Pick a date."); return; }
    var res = await P.client.from("budget_entries").insert({
      kind: P.$("fin_budgetKind").value, label: label, amount: amount,
      entry_date: date, note: note, created_by: P.me.id
    });
    if (res.error) { P.showMsg(msg, "Could not save: " + res.error.message); return; }
    P.$("fin_budgetLabel").value = ""; P.$("fin_budgetAmount").value = ""; P.$("fin_budgetNote").value = "";
    await fin_loadBudget(); fin_renderBudget();
    P.showMsg(msg, "Budget entry added.", "ok");
  }

  /* ---------- #5 sponsors list ---------- */
  function fin_renderSponsors() {
    var listEl = P.$("fin_sponsorList");
    if (!listEl) return;
    if (!fin_sponsors.length) {
      listEl.innerHTML = "<p class=\"empty\">No sponsors yet.</p>";
      return;
    }
    listEl.innerHTML = fin_sponsors.map(function (s) {
      return '<div class="row-item"><div class="body"><b>' + P.esc(s.name || "…") + "</b> " +
        fin_statusChip(s.status || "talking", s.status === "confirmed") +
        '<div class="meta">' +
        (s.deal_value != null ? P.esc(fin_money(s.deal_value)) + " &middot; " : "") +
        (s.contact_name ? P.esc(s.contact_name) + " &middot; " : "") +
        (s.contact_email ? P.esc(s.contact_email) + " &middot; " : "") +
        (s.contact_phone ? P.esc(s.contact_phone) : "") + "</div>" +
        (s.note ? "<p>" + P.esc(s.note) + "</p>" : "") + "</div>" +
        '<div class="actions">' +
        '<button class="btn ghost small" type="button" data-fin-sponsor-edit="' + P.esc(s.id) + '">Edit</button>' +
        '<button class="btn ghost small" type="button" data-fin-sponsor-del="' + P.esc(s.id) + '">Delete</button>' +
        "</div></div>";
    }).join("");
  }

  function fin_resetSponsorForm() {
    fin_editingSponsor = null;
    P.$("fin_sponsorName").value = ""; P.$("fin_sponsorContact").value = "";
    P.$("fin_sponsorEmail").value = ""; P.$("fin_sponsorPhone").value = "";
    P.$("fin_sponsorDeal").value = ""; P.$("fin_sponsorStatus").value = "talking";
    P.$("fin_sponsorNote").value = "";
    P.$("fin_sponsorSubmit").textContent = "Add sponsor";
    P.$("fin_sponsorCancel").hidden = true;
  }

  async function fin_saveSponsor(e) {
    e.preventDefault();
    if (!P.isMainAdmin()) return;
    var msg = P.$("fin_sponsorMsg");
    P.hideMsg(msg);
    var name = P.$("fin_sponsorName").value.trim();
    var dealRaw = P.$("fin_sponsorDeal").value;
    var deal = dealRaw === "" ? null : Number(dealRaw);
    if (!name) { P.showMsg(msg, "Enter the sponsor's name."); return; }
    if (deal != null && (isNaN(deal) || deal < 0)) { P.showMsg(msg, "Enter a valid deal value."); return; }
    var row = {
      name: name,
      contact_name: P.$("fin_sponsorContact").value.trim() || null,
      contact_email: P.$("fin_sponsorEmail").value.trim() || null,
      contact_phone: P.$("fin_sponsorPhone").value.trim() || null,
      deal_value: deal,
      status: P.$("fin_sponsorStatus").value,
      note: P.$("fin_sponsorNote").value.trim() || null
    };
    var res = fin_editingSponsor
      ? await P.client.from("sponsors").update(row).eq("id", fin_editingSponsor)
      : await P.client.from("sponsors").insert(row);
    if (res.error) { P.showMsg(msg, "Could not save: " + res.error.message); return; }
    fin_resetSponsorForm();
    await fin_loadSponsors(); fin_renderSponsors();
    P.showMsg(msg, "Sponsor saved.", "ok");
  }

  function fin_wireSponsors() {
    var listEl = P.$("fin_sponsorList");
    if (!listEl) return;
    listEl.addEventListener("click", async function (e) {
      if (!P.isMainAdmin()) return;
      var editBtn = e.target.closest("[data-fin-sponsor-edit]");
      var delBtn = e.target.closest("[data-fin-sponsor-del]");
      if (editBtn) {
        var id = editBtn.getAttribute("data-fin-sponsor-edit");
        var s = null;
        fin_sponsors.forEach(function (x) { if (String(x.id) === String(id)) s = x; });
        if (!s) return;
        fin_editingSponsor = id;
        P.$("fin_sponsorName").value = s.name || "";
        P.$("fin_sponsorContact").value = s.contact_name || "";
        P.$("fin_sponsorEmail").value = s.contact_email || "";
        P.$("fin_sponsorPhone").value = s.contact_phone || "";
        P.$("fin_sponsorDeal").value = s.deal_value != null ? s.deal_value : "";
        P.$("fin_sponsorStatus").value = s.status || "talking";
        P.$("fin_sponsorNote").value = s.note || "";
        P.$("fin_sponsorSubmit").textContent = "Save changes";
        P.$("fin_sponsorCancel").hidden = false;
        P.$("fin_sponsorName").focus();
      } else if (delBtn) {
        if (!window.confirm("Delete this sponsor?")) return;
        var res = await P.client.from("sponsors").delete().eq("id", delBtn.getAttribute("data-fin-sponsor-del"));
        if (res.error) { P.showMsg(P.$("fin_sponsorMsg"), "Could not delete: " + res.error.message); return; }
        await fin_loadSponsors(); fin_renderSponsors();
      }
    });
  }

  /* ---------- #43 merch orders / #55 approve (Main Admin, President, VP) ---------- */
  function fin_renderMerch() {
    var listEl = P.$("fin_merchList");
    if (!listEl) return;
    var canApprove = fin_canApproveMerch();
    var rows = canApprove ? fin_merch.slice() : fin_merch.filter(function (o) { return o.member_id === P.me.id; });
    if (!rows.length) {
      listEl.innerHTML = canApprove
        ? "<p class=\"empty\">No merch orders yet.</p>"
        : "<p class=\"empty\">You have not ordered any merch yet.</p>";
      return;
    }
    listEl.innerHTML = rows.map(function (o) {
      var chip = o.status === "delivered" ? fin_statusChip("Delivered", false)
        : o.status === "confirmed" ? fin_statusChip("Confirmed", true)
        : fin_statusChip("Pending", true);
      var actions = "";
      if (canApprove && o.status === "pending") actions += '<button class="btn ghost small" type="button" data-fin-merch-confirm="' + P.esc(o.id) + '">Confirm</button>';
      if (canApprove && o.status === "confirmed") actions += '<button class="btn ghost small" type="button" data-fin-merch-deliver="' + P.esc(o.id) + '">Mark delivered</button>';
      if (!canApprove && o.status === "pending") actions += '<button class="btn ghost small" type="button" data-fin-merch-cancel="' + P.esc(o.id) + '">Cancel order</button>';
      if (P.isMainAdmin()) actions += '<button class="btn ghost small" type="button" data-fin-merch-del="' + P.esc(o.id) + '">Delete</button>';
      return '<div class="row-item"><div class="body"><b>' + P.esc(o.item || "…") + "</b> " + chip +
        '<div class="meta">' + P.esc(fin_memberName(o.member_id)) +
        " &middot; Size " + P.esc(o.size || "—") + " &middot; Qty " + P.esc(o.qty || 1) +
        (o.note ? " &middot; " + P.esc(o.note) : "") + "</div></div>" +
        (actions ? '<div class="actions">' + actions + "</div>" : "") + "</div>";
    }).join("");
  }

  async function fin_saveMerch(e) {
    e.preventDefault();
    var msg = P.$("fin_merchMsg");
    P.hideMsg(msg);
    var item = P.$("fin_merchItem").value.trim();
    var qty = Number(P.$("fin_merchQty").value);
    if (!item) { P.showMsg(msg, "Enter the merch item."); return; }
    if (isNaN(qty) || qty < 1) { P.showMsg(msg, "Enter a quantity of at least 1."); return; }
    var res = await P.client.from("merch_orders").insert({
      member_id: P.me.id, item: item, size: P.$("fin_merchSize").value,
      qty: qty, status: "pending", note: P.$("fin_merchNote").value.trim() || null
    });
    if (res.error) { P.showMsg(msg, "Could not place the order: " + res.error.message); return; }
    P.$("fin_merchItem").value = ""; P.$("fin_merchQty").value = "1"; P.$("fin_merchNote").value = "";
    await fin_loadMerch(); fin_renderMerch();
    P.showMsg(msg, "Merch order placed — the Main Admin will confirm it.", "ok");
  }

  function fin_wireMerch() {
    var listEl = P.$("fin_merchList");
    if (!listEl) return;
    listEl.addEventListener("click", async function (e) {
      var conf = e.target.closest("[data-fin-merch-confirm]");
      var deliv = e.target.closest("[data-fin-merch-deliver]");
      var cancel = e.target.closest("[data-fin-merch-cancel]");
      var del = e.target.closest("[data-fin-merch-del]");
      var id = null, next = null;
      if (conf) { id = conf.getAttribute("data-fin-merch-confirm"); next = "confirmed"; }
      else if (deliv) { id = deliv.getAttribute("data-fin-merch-deliver"); next = "delivered"; }
      if (id) {
        if (!fin_canApproveMerch()) return;
        var r = await P.client.from("merch_orders").update({ status: next }).eq("id", id);
        if (r.error) { P.showMsg(P.$("fin_merchMsg"), "Could not update: " + r.error.message); return; }
        await fin_loadMerch(); fin_renderMerch();
        return;
      }
      if (cancel) {
        var o = null;
        fin_merch.forEach(function (x) { if (String(x.id) === String(cancel.getAttribute("data-fin-merch-cancel"))) o = x; });
        if (!o || o.member_id !== P.me.id || o.status !== "pending") return;
        if (!window.confirm("Cancel this merch order?")) return;
        var r2 = await P.client.from("merch_orders").delete().eq("id", o.id);
        if (r2.error) { P.showMsg(P.$("fin_merchMsg"), "Could not cancel: " + r2.error.message); return; }
        await fin_loadMerch(); fin_renderMerch();
        return;
      }
      if (del) {
        if (!P.isMainAdmin()) return;
        if (!window.confirm("Delete this merch order?")) return;
        var r3 = await P.client.from("merch_orders").delete().eq("id", del.getAttribute("data-fin-merch-del"));
        if (r3.error) { P.showMsg(P.$("fin_merchMsg"), "Could not delete: " + r3.error.message); return; }
        await fin_loadMerch(); fin_renderMerch();
      }
    });
  }

  /* ---------- #45 my fee status (Settings tab) ---------- */
  function fin_renderMyFee() {
    var body = P.$("fin_myFeeBody");
    if (!body) return;
    var f = fin_feeFor(P.me.id, fin_year);
    if (!f) {
      body.innerHTML = '<p style="margin:0">No fee record for <b>' + P.esc(fin_year) + '</b> yet — your fee is <b>pending</b>. Ask the Main Admin if you have already paid.</p>';
    } else if (f.paid) {
      body.innerHTML = '<p style="margin:0">Your membership fee for <b>' + P.esc(fin_year) + '</b> is <b>paid</b> — ' + P.esc(fin_money(f.amount)) +
        (f.paid_at ? " on " + P.esc(P.timeAgo(f.paid_at)) : "") + ".</p>";
    } else {
      body.innerHTML = '<p style="margin:0">Your membership fee for <b>' + P.esc(fin_year) + '</b> is <b>pending</b>' +
        (f.amount != null ? " — " + P.esc(fin_money(f.amount)) : "") +
        ". Please pay it at the next rehearsal, or message the Main Admin.</p>";
    }
  }

  /* ---------- #52 email a filtered group (Main Admin only) ---------- */
  function fin_renderEmail() {
    var filterEl = P.$("fin_emailFilter");
    if (!filterEl) return;
    var wrap = P.$("fin_emailVerticalWrap");
    var filter = filterEl.value;
    if (wrap) wrap.hidden = filter !== "vertical";
    var list = [];
    if (filter === "all") {
      list = fin_allMembers().filter(function (m) { return m.email; });
    } else if (filter === "officials") {
      list = fin_allMembers().filter(function (m) {
        if (!m.email) return false;
        if (m.door) return m.door !== "member";
        return m.role !== "member" && m.role !== "core_member";
      });
    } else if (filter === "unpaid") {
      list = fin_pendingMembers().map(function (p) { return p.member; }).filter(function (m) { return m.email; });
    } else if (filter === "vertical") {
      /* Member profiles do not store a vertical (see notes.md), so no
         address list can be built for this filter. Deliberately empty. */
      list = [];
    }
    fin_emailAddrs = list.map(function (m) { return m.email; });
    var cntEl = P.$("fin_emailCount");
    if (cntEl) cntEl.textContent = fin_emailAddrs.length + (fin_emailAddrs.length === 1 ? " recipient" : " recipients");
    var listEl = P.$("fin_emailList");
    if (listEl) listEl.value = fin_emailAddrs.join(", ");
  }

  function fin_fillVerticals() {
    var sel = P.$("fin_emailVertical");
    if (!sel) return;
    var seen = {};
    var vals = [];
    (P.applicantsRows || []).forEach(function (a) {
      if (a.vertical && !seen[a.vertical]) { seen[a.vertical] = true; vals.push(a.vertical); }
    });
    sel.innerHTML = vals.length
      ? vals.map(function (v) { return '<option value="' + P.esc(v) + '">' + P.esc(v) + "</option>"; }).join("")
      : '<option value="">— no verticals found yet —</option>';
  }

  function fin_copyEmails() {
    var msg = P.$("fin_emailMsg");
    P.hideMsg(msg);
    if (!fin_emailAddrs.length) { P.showMsg(msg, "There are no email addresses to copy for this filter."); return; }
    var text = fin_emailAddrs.join(", ");
    function done() { P.showMsg(msg, "Copied " + fin_emailAddrs.length + " email addresses.", "ok"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fin_copyFallback(text, done); });
    } else {
      fin_copyFallback(text, done);
    }
  }
  function fin_copyFallback(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { P.showMsg(P.$("fin_emailMsg"), "Copy did not work in this browser — the addresses are listed above; select and copy them by hand."); }
    ta.remove();
  }
  function fin_composeEmail() {
    var msg = P.$("fin_emailMsg");
    P.hideMsg(msg);
    if (!fin_emailAddrs.length) { P.showMsg(msg, "There are no email addresses for this filter, so there is nothing to compose."); return; }
    var subject = (P.$("fin_emailSubject").value || "").trim() || "REVA Fashion Club";
    var href = "mailto:?bcc=" + encodeURIComponent(fin_emailAddrs.join(",")) + "&subject=" + encodeURIComponent(subject);
    if (href.length > 1800) {
      P.showMsg(msg, "That is a long address list (" + fin_emailAddrs.length + " people) — some mail apps cut off very long links. Use “Copy email addresses” and paste them into BCC yourself if the draft opens empty.");
    }
    var a = document.createElement("a");
    a.href = href;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- #71 one-click full backup (Main Admin only) ---------- */
  async function fin_backup() {
    if (!P.isMainAdmin()) return;
    var msg = P.$("fin_backupMsg");
    var btn = P.$("fin_backupBtn");
    P.hideMsg(msg);
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
    var members = (P.adminRows && P.adminRows.length) ? P.adminRows : P.directory;
    var applicants = P.applicantsRows || [];
    var fees = await P.client.from("fees").select("*");
    var budget = await P.client.from("budget_entries").select("*");
    var sponsors = await P.client.from("sponsors").select("*");
    var merch = await P.client.from("merch_orders").select("*");
    var events = await P.client.from("events").select("*");
    if (btn) { btn.disabled = false; btn.textContent = "Download full backup (JSON)"; }
    var bad = [fees, budget, sponsors, merch].filter(function (r) { return r.error; })[0];
    if (bad) { P.showMsg(msg, "Could not build the backup: " + bad.error.message); return; }
    var data = {
      exported_at: new Date().toISOString(),
      exported_by: P.me.login_id || P.me.id,
      club_year: fin_year,
      members: members || [],
      applicants: applicants,
      events: events.error ? [] : (events.data || []),
      fees: fees.data || [],
      budget_entries: budget.data || [],
      sponsors: sponsors.data || [],
      merch_orders: merch.data || []
    };
    /* Deliberately no messages: the backup must not include other
       members' private direct messages. */
    P.downloadFile("reva-fashion-club-full-backup-" + fin_today() + ".json",
      JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    P.showMsg(msg, "Backup downloaded — members, applicants, events and finances. No private messages included.", "ok");
  }

  /* ---------- gating + wiring ---------- */
  function fin_applyGating() {
    var isMA = P.isMainAdmin();
    var canFees = fin_canSeeFees();
    var feeSection = P.$("fin_feeSection");
    if (feeSection) feeSection.hidden = !canFees;
    var budgetSection = P.$("fin_budgetSection");
    if (budgetSection) budgetSection.hidden = !isMA;
    var sponsorSection = P.$("fin_sponsorSection");
    if (sponsorSection) sponsorSection.hidden = !isMA;
    var backupSection = P.$("fin_backupSection");
    if (backupSection) backupSection.hidden = !isMA;
    var emailCard = P.$("fin_emailCard");
    if (emailCard) emailCard.hidden = !isMA;
    var feeForm = P.$("fin_feeForm");
    if (feeForm) feeForm.style.display = isMA ? "" : "none";
    var budgetForm = P.$("fin_budgetForm");
    if (budgetForm) budgetForm.style.display = isMA ? "" : "none";
    var sponsorForm = P.$("fin_sponsorForm");
    if (sponsorForm) sponsorForm.style.display = isMA ? "" : "none";
  }

  function fin_fillFeeMembers() {
    var sel = P.$("fin_feeMember");
    if (!sel) return;
    sel.innerHTML = fin_allMembers().map(function (m) {
      return '<option value="' + P.esc(m.id) + '">' + P.esc(m.name || "…") + " — " + P.esc(P.roleLabel(m.role)) + "</option>";
    }).join("");
  }

  async function fin_init() {
    fin_applyGating();
    await fin_loadYear();
    fin_fillFeeMembers();
    var yearInput = P.$("fin_feeYear");
    if (yearInput) yearInput.value = fin_year;
    var paidAt = P.$("fin_feePaidAt");
    if (paidAt) paidAt.value = fin_today();
    var bDate = P.$("fin_budgetDate");
    if (bDate) bDate.value = fin_today();
    fin_fillVerticals();
    await fin_loadAll();

    var feeForm = P.$("fin_feeForm");
    if (feeForm) feeForm.addEventListener("submit", fin_saveFee);
    var remindBtn = P.$("fin_remindBtn");
    if (remindBtn) remindBtn.addEventListener("click", fin_remindUnpaid);
    fin_wireFeeActions();
    var budgetForm = P.$("fin_budgetForm");
    if (budgetForm) budgetForm.addEventListener("submit", fin_saveBudget);
    var budgetList = P.$("fin_budgetList");
    if (budgetList) budgetList.addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-fin-budget-del]");
      if (!btn || !P.isMainAdmin()) return;
      if (!window.confirm("Delete this budget entry?")) return;
      var res = await P.client.from("budget_entries").delete().eq("id", btn.getAttribute("data-fin-budget-del"));
      if (res.error) { P.showMsg(P.$("fin_budgetMsg"), "Could not delete: " + res.error.message); return; }
      await fin_loadBudget(); fin_renderBudget();
    });
    var sponsorForm = P.$("fin_sponsorForm");
    if (sponsorForm) sponsorForm.addEventListener("submit", fin_saveSponsor);
    var sponsorCancel = P.$("fin_sponsorCancel");
    if (sponsorCancel) sponsorCancel.addEventListener("click", function () { fin_resetSponsorForm(); P.hideMsg(P.$("fin_sponsorMsg")); });
    fin_wireSponsors();
    var merchForm = P.$("fin_merchForm");
    if (merchForm) merchForm.addEventListener("submit", fin_saveMerch);
    fin_wireMerch();
    var filterEl = P.$("fin_emailFilter");
    if (filterEl) filterEl.addEventListener("change", fin_renderEmail);
    var copyBtn = P.$("fin_emailCopyBtn");
    if (copyBtn) copyBtn.addEventListener("click", fin_copyEmails);
    var composeBtn = P.$("fin_emailComposeBtn");
    if (composeBtn) composeBtn.addEventListener("click", fin_composeEmail);
    var backupBtn = P.$("fin_backupBtn");
    if (backupBtn) backupBtn.addEventListener("click", fin_backup);

    /* Refresh when the Finance tab is opened, so the lists are never stale. */
    var tabBtn = document.querySelector('nav.tabs button[data-tab="finance"]');
    if (tabBtn) tabBtn.addEventListener("click", function () { fin_loadAll(); });
  }

  fin_init();
}



/* ================= engage/engage.js ================= */

/* Engagement package (features 91, Step 16) — REVA Fashion Club portal.
   Runs after portal.js boot via window.__f91Init(P). Only snippet code:
   it never edits portal.js and only touches portal-owned lists through
   MutationObserver + document-level delegation (data-eg-* attributes).
   All role gating mirrors the portal rules; the database enforces them
   again server-side. Plain ES5 style to match portal.js. */
function f91InitEngage(P) {
  var client = P.client;
  var me = P.me;
  if (!me || !client) return;
  var myId = me.id;
  var myRole = me.role;

  /* ---------- tiny helpers ---------- */
  function eg_el(id) { return document.getElementById(id); }
  function eg_esc(s) { return P.esc(s); }
  function eg_isRole(r) { return myRole === r; }
  function eg_canCreatePoll() { return P.isMainAdmin() || eg_isRole("president") || eg_isRole("vice_president"); }
  function eg_canAssignTask() { return P.isMainAdmin() || eg_isRole("president") || eg_isRole("vice_president"); }
  function eg_canApproveLeave() { return P.isPrivileged(); }
  function eg_canSeeSuggestions() { return P.isOfficialOrAbove(); }
  function eg_canMarkSuggestion() { return P.isMainAdmin() || eg_isRole("president") || eg_isRole("vice_president"); }
  function eg_canWriteNotes() { return P.isMainAdmin() || eg_isRole("president") || eg_isRole("vice_president"); }
  function eg_canSeeNotes() { return P.isOfficialOrAbove(); }
  function eg_canPlanSocial() { return P.isMainAdmin(); }
  function eg_canSeeSocial() { return P.isOfficialOrAbove(); }
  function eg_canModerateWall() { return P.isOfficialOrAbove(); }
  function eg_memberName(id) {
    var p = (P.directory || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : "Club member";
  }
  function eg_fillMemberSelect(sel, placeholder) {
    if (!sel) return;
    var html = '<option value="">' + eg_esc(placeholder || "Choose a member…") + "</option>";
    (P.directory || []).forEach(function (p) {
      html += '<option value="' + eg_esc(p.id) + '">' + eg_esc(p.name) + " — " + eg_esc(P.roleLabel(p.role)) + "</option>";
    });
    sel.innerHTML = html;
  }
  function eg_show(el, on) { if (el) el.hidden = !on; }
  function eg_on(id, ev, fn) { var el = eg_el(id); if (el) el.addEventListener(ev, fn); }

  /* ---------- #6 / #11 / #19 Polls & voting ---------- */
  var eg_polls = [];
  var eg_myVotes = {}; /* poll_id -> option_index */
  async function eg_loadPolls() {
    var res = await client.from("polls").select("*").order("created_at", { ascending: false }).limit(30);
    if (res.error) {
      var l = eg_el("eg_pollList");
      if (l) l.innerHTML = '<p class="empty">Could not load polls: ' + eg_esc(res.error.message) + "</p>";
      return;
    }
    eg_polls = res.data || [];
    var vres = await client.from("poll_votes").select("poll_id,option_index").eq("member_id", myId);
    eg_myVotes = {};
    if (!vres.error && vres.data) vres.data.forEach(function (v) { eg_myVotes[v.poll_id] = v.option_index; });
    eg_renderPolls();
  }
  function eg_pollEnded(p) {
    if (p.closed) return true;
    if (p.ends_at) return new Date(p.ends_at).getTime() < Date.now();
    return false;
  }
  function eg_renderPolls() {
    var list = eg_el("eg_pollList");
    if (!list) return;
    if (!eg_polls.length) { list.innerHTML = '<p class="empty">No polls yet.</p>'; return; }
    list.innerHTML = eg_polls.map(function (p) {
      var opts = p.options || [];
      var ended = eg_pollEnded(p);
      var voted = eg_myVotes[p.id] !== undefined && eg_myVotes[p.id] !== null;
      var counts = [];
      var total = 0;
      /* Counts are only computed for display after voting / closing;
         the query runs regardless but the numbers stay hidden until then. */
      return '<div class="row-item"><div class="body"><b>' + eg_esc(p.question) + "</b> " +
        '<span class="chip' + (ended ? " ghost" : " orange") + '">' + (ended ? "Closed" : "Open") + "</span>" +
        '<div class="meta">' + (p.ends_at ? "Ends " + eg_esc(new Date(p.ends_at).toLocaleString()) + " &middot; " : "") +
        "By " + eg_esc(eg_memberName(p.created_by)) + "</div>" +
        '<div class="eg-poll-opts" data-eg-poll="' + eg_esc(p.id) + '">' +
        opts.map(function (opt, i) {
          if (ended || voted) {
            counts[i] = 0;
            return '<div class="eg-opt"><span>' + eg_esc(opt) + '</span>' +
              '<span class="eg-count" data-eg-count="' + eg_esc(p.id) + ":" + i + '">…</span></div>';
          }
          return '<button class="btn ghost small eg-vote-btn" type="button" data-eg-action="eg-vote" data-eg-poll="' +
            eg_esc(p.id) + '" data-eg-opt="' + i + '">' + eg_esc(opt) + "</button>";
        }).join("") +
        "</div>" +
        (voted ? '<p class="muted">You voted: ' + eg_esc(opts[eg_myVotes[p.id]] || "") + "</p>" : "") +
        "</div></div>";
    }).join("");
    /* Fill live counts only where results are visible (voted or closed). */
    eg_polls.forEach(function (p) {
      if (!(eg_pollEnded(p) || eg_myVotes[p.id] !== undefined)) return;
      client.from("poll_votes").select("option_index").eq("poll_id", p.id).then(function (r) {
        if (r.error || !r.data) return;
        var counts = {};
        r.data.forEach(function (v) { counts[v.option_index] = (counts[v.option_index] || 0) + 1; });
        var total = r.data.length;
        (p.options || []).forEach(function (opt, i) {
          var n = counts[i] || 0;
          var pct = total ? Math.round((n / total) * 100) : 0;
          var bar = document.querySelector('[data-eg-poll="' + p.id + '"] .eg-opt:nth-child(' + (i + 1) + ")");
          var cnt = document.querySelector('[data-eg-count="' + p.id + ":" + i + '"]');
          if (cnt) cnt.textContent = n + " vote" + (n === 1 ? "" : "s") + " (" + pct + "%)";
          if (bar) {
            var fill = bar.querySelector(".eg-bar-fill");
            if (!fill) {
              var wrap = document.createElement("div");
              wrap.className = "eg-bar";
              wrap.innerHTML = '<div class="eg-bar-fill" style="width:' + pct + '%"></div>';
              bar.appendChild(wrap);
            } else { fill.style.width = pct + "%"; }
          }
        });
      });
    });
  }
  eg_on("eg_pollForm", "submit", async function (e) {
    e.preventDefault();
    var q = eg_el("eg_pollQ").value.trim();
    var opts = eg_el("eg_pollOpts").value.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    var ends = eg_el("eg_pollEnds").value;
    var msg = eg_el("eg_pollMsg");
    if (!q) { P.showMsg(msg, "Write a question first."); return; }
    if (opts.length < 2) { P.showMsg(msg, "Give at least two options, separated by commas."); return; }
    var res = await client.from("polls").insert({
      question: q, options: opts,
      ends_at: ends ? new Date(ends).toISOString() : null,
      closed: false, created_by: myId
    });
    if (res.error) { P.showMsg(msg, "Could not create the poll: " + res.error.message); return; }
    eg_el("eg_pollQ").value = ""; eg_el("eg_pollOpts").value = ""; eg_el("eg_pollEnds").value = "";
    P.showMsg(msg, "Poll created.", "ok");
    await eg_loadPolls();
  });

  /* ---------- #12 / #40 Tasks ---------- */
  var eg_tasks = [];
  async function eg_loadTasks() {
    var res = await client.from("tasks").select("*").order("due_date", { ascending: true }).limit(100);
    if (res.error) return;
    eg_tasks = res.data || [];
    eg_renderTasks();
    eg_renderDashTasks();
  }
  function eg_taskHtml(t) {
    var mine = t.assignee_id === myId;
    var overdue = t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < Date.now();
    return '<div class="row-item' + (t.status === "done" ? "" : " unread") + '"><div class="body"><b>' + eg_esc(t.title) + "</b> " +
      '<span class="chip' + (t.status === "done" ? " ghost" : " orange") + '">' + (t.status === "done" ? "Done" : "Pending") + "</span>" +
      (overdue ? ' <span class="chip ghost">Overdue</span>' : "") +
      '<div class="meta">For ' + eg_esc(eg_memberName(t.assignee_id)) + (t.due_date ? " &middot; Due " + eg_esc(new Date(t.due_date).toLocaleDateString()) : " &middot; No deadline") +
      " &middot; From " + eg_esc(eg_memberName(t.created_by)) + "</div>" +
      (t.description ? "<p>" + eg_esc(t.description) + "</p>" : "") +
      "</div>" +
      '<div class="actions">' +
      (mine && t.status !== "done" ? '<button class="btn ghost small" type="button" data-eg-action="eg-task-done" data-eg-id="' + eg_esc(t.id) + '">Mark done</button>' : "") +
      (eg_canAssignTask() && t.status === "done" ? '<button class="btn ghost small" type="button" data-eg-action="eg-task-reopen" data-eg-id="' + eg_esc(t.id) + '">Reopen</button>' : "") +
      "</div></div>";
  }
  function eg_renderTasks() {
    var list = eg_el("eg_taskList");
    if (!list) return;
    var mine = eg_tasks.filter(function (t) { return t.assignee_id === myId; });
    var others = eg_tasks.filter(function (t) { return t.assignee_id !== myId; });
    var html = "";
    if (mine.length) html += '<p class="muted">Your tasks</p>' + mine.map(eg_taskHtml).join("");
    if (eg_canAssignTask() && others.length) html += '<p class="muted">Tasks you assigned / others</p>' + others.map(eg_taskHtml).join("");
    if (!html) html = '<p class="empty">No tasks yet.</p>';
    list.innerHTML = html;
  }
  function eg_renderDashTasks() {
    var list = eg_el("eg_dashTaskList");
    if (!list) return;
    var mine = eg_tasks.filter(function (t) { return t.assignee_id === myId && t.status !== "done"; });
    if (!mine.length) { list.innerHTML = '<p class="empty">No pending tasks. You are all caught up.</p>'; return; }
    list.innerHTML = mine.slice(0, 5).map(function (t) {
      return '<div class="row-item"><div class="body"><b>' + eg_esc(t.title) + "</b>" +
        '<div class="meta">' + (t.due_date ? "Due " + eg_esc(new Date(t.due_date).toLocaleDateString()) : "No deadline") + "</div></div>" +
        '<div class="actions"><button class="btn ghost small" type="button" data-eg-action="eg-task-done" data-eg-id="' + eg_esc(t.id) + '">Mark done</button></div></div>';
    }).join("");
  }
  eg_on("eg_taskForm", "submit", async function (e) {
    e.preventDefault();
    var title = eg_el("eg_taskTitle").value.trim();
    var assignee = eg_el("eg_taskAssignee").value;
    var msg = eg_el("eg_taskMsg");
    if (!title) { P.showMsg(msg, "Give the task a title."); return; }
    if (!assignee) { P.showMsg(msg, "Choose who this task is for."); return; }
    var res = await client.from("tasks").insert({
      title: title, description: eg_el("eg_taskDesc").value.trim() || null,
      assignee_id: assignee,
      due_date: eg_el("eg_taskDue").value || null,
      status: "pending", created_by: myId
    });
    if (res.error) { P.showMsg(msg, "Could not assign the task: " + res.error.message); return; }
    eg_el("eg_taskTitle").value = ""; eg_el("eg_taskDesc").value = ""; eg_el("eg_taskDue").value = "";
    P.showMsg(msg, "Task assigned.", "ok");
    await eg_loadTasks();
  });

  /* ---------- #20 / #32 / #35 Leave / absence requests ---------- */
  var eg_events = [];
  var eg_leaves = [];
  async function eg_loadEvents() {
    var res = await client.from("events").select("id,title,starts_at").order("starts_at", { ascending: true }).limit(50);
    if (!res.error && res.data) eg_events = res.data;
    var sel = eg_el("eg_leaveEvent");
    if (sel) sel.innerHTML = '<option value="">Choose an event…</option>' + eg_events.map(function (ev) {
      return '<option value="' + eg_esc(ev.id) + '">' + eg_esc(ev.title) +
        (ev.starts_at ? " — " + eg_esc(new Date(ev.starts_at).toLocaleDateString()) : "") + "</option>";
    }).join("");
  }
  async function eg_loadLeaves() {
    var res = await client.from("leave_requests").select("*").order("created_at", { ascending: false }).limit(100);
    if (res.error) return;
    eg_leaves = res.data || [];
    eg_renderLeaves();
  }
  function eg_renderLeaves() {
    var list = eg_el("eg_leaveList");
    if (!list) return;
    var visible = eg_canApproveLeave() ? eg_leaves : eg_leaves.filter(function (l) { return l.member_id === myId; });
    if (!visible.length) { list.innerHTML = '<p class="empty">No leave requests yet.</p>'; return; }
    list.innerHTML = visible.map(function (l) {
      var ev = eg_events.filter(function (e) { return e.id === l.event_id; })[0];
      return '<div class="row-item"><div class="body"><b>' + eg_esc(eg_memberName(l.member_id)) + "</b> " +
        '<span class="chip' + (l.status === "approved" ? "" : l.status === "declined" ? " ghost" : " orange") + '">' + eg_esc(l.status) + "</span>" +
        '<div class="meta">' + eg_esc(ev ? ev.title : "Event") + " &middot; " + eg_esc(P.timeAgo(l.created_at)) +
        (l.decided_by ? " &middot; Decided by " + eg_esc(eg_memberName(l.decided_by)) : "") + "</div>" +
        "<p>" + eg_esc(l.reason || "") + "</p></div>" +
        (eg_canApproveLeave() && l.status === "pending" ? '<div class="actions">' +
          '<button class="btn ghost small" type="button" data-eg-action="eg-leave-approve" data-eg-id="' + eg_esc(l.id) + '">Approve</button>' +
          '<button class="btn ghost small" type="button" data-eg-action="eg-leave-decline" data-eg-id="' + eg_esc(l.id) + '">Decline</button>' +
          "</div>" : "") +
        "</div>";
    }).join("");
  }
  eg_on("eg_leaveForm", "submit", async function (e) {
    e.preventDefault();
    var ev = eg_el("eg_leaveEvent").value;
    var reason = eg_el("eg_leaveReason").value.trim();
    var msg = eg_el("eg_leaveMsg");
    if (!ev) { P.showMsg(msg, "Pick the event you will miss."); return; }
    if (!reason) { P.showMsg(msg, "Give a short reason."); return; }
    var res = await client.from("leave_requests").insert({
      member_id: myId, event_id: ev, reason: reason, status: "pending", decided_by: null
    });
    if (res.error) { P.showMsg(msg, "Could not send the request: " + res.error.message); return; }
    eg_el("eg_leaveReason").value = "";
    P.showMsg(msg, "Leave request sent. An official will approve or decline it.", "ok");
    await eg_loadLeaves();
  });

  /* ---------- #22 / #57 Suggestion box ---------- */
  var eg_suggestions = [];
  async function eg_loadSuggestions() {
    if (!eg_canSeeSuggestions()) return;
    var res = await client.from("suggestions").select("*").order("created_at", { ascending: false }).limit(100);
    if (res.error) return;
    eg_suggestions = res.data || [];
    eg_renderSuggestions();
  }
  function eg_renderSuggestions() {
    var list = eg_el("eg_suggList");
    if (!list) return;
    if (!eg_suggestions.length) { list.innerHTML = '<p class="empty">No suggestions yet.</p>'; return; }
    list.innerHTML = eg_suggestions.map(function (s) {
      var who = s.is_anonymous || !s.member_id ? "Anonymous" : eg_memberName(s.member_id);
      return '<div class="row-item"><div class="body"><b>' + eg_esc(who) + "</b> " +
        '<span class="chip' + (s.status === "done" ? "" : s.status === "planned" ? " orange" : " ghost") + '">' + eg_esc(s.status) + "</span>" +
        '<div class="meta">' + eg_esc(P.timeAgo(s.created_at)) + "</div>" +
        "<p>" + eg_esc(s.body) + "</p></div>" +
        (eg_canMarkSuggestion() && s.status !== "done" ? '<div class="actions">' +
          (s.status !== "planned" ? '<button class="btn ghost small" type="button" data-eg-action="eg-sugg-planned" data-eg-id="' + eg_esc(s.id) + '">Mark planned</button>' : "") +
          '<button class="btn ghost small" type="button" data-eg-action="eg-sugg-done" data-eg-id="' + eg_esc(s.id) + '">Mark done</button>' +
          "</div>" : "") +
        "</div>";
    }).join("");
  }
  eg_on("eg_suggForm", "submit", async function (e) {
    e.preventDefault();
    var body = eg_el("eg_suggBody").value.trim();
    var msg = eg_el("eg_suggMsg");
    if (!body) { P.showMsg(msg, "Write your idea first."); return; }
    var anon = eg_el("eg_suggAnon").checked;
    var res = await client.from("suggestions").insert({
      member_id: anon ? null : myId, body: body, is_anonymous: anon, status: "new"
    });
    if (res.error) { P.showMsg(msg, "Could not send the suggestion: " + res.error.message); return; }
    eg_el("eg_suggBody").value = ""; eg_el("eg_suggAnon").checked = false;
    P.showMsg(msg, anon ? "Suggestion sent anonymously." : "Suggestion sent. Thank you.", "ok");
    await eg_loadSuggestions();
  });

  /* ---------- #37 Meeting notes ---------- */
  var eg_notes = [];
  async function eg_loadNotes() {
    if (!eg_canSeeNotes()) return;
    var res = await client.from("meeting_notes").select("*").order("meeting_date", { ascending: false }).limit(50);
    if (res.error) return;
    eg_notes = res.data || [];
    var list = eg_el("eg_noteList");
    if (!list) return;
    if (!eg_notes.length) { list.innerHTML = '<p class="empty">No meeting notes yet.</p>'; return; }
    list.innerHTML = eg_notes.map(function (n) {
      return '<div class="row-item"><div class="body"><b>' + eg_esc(n.title) + "</b>" +
        '<div class="meta">' + (n.meeting_date ? eg_esc(new Date(n.meeting_date).toLocaleDateString()) + " &middot; " : "") +
        "By " + eg_esc(eg_memberName(n.created_by)) + "</div>" +
        "<p>" + eg_esc(n.body) + "</p></div></div>";
    }).join("");
  }
  eg_on("eg_noteForm", "submit", async function (e) {
    e.preventDefault();
    var title = eg_el("eg_noteTitle").value.trim();
    var body = eg_el("eg_noteBody").value.trim();
    var msg = eg_el("eg_noteMsg");
    if (!title || !body) { P.showMsg(msg, "Give the notes a title and write the minutes."); return; }
    var res = await client.from("meeting_notes").insert({
      title: title, body: body,
      meeting_date: eg_el("eg_noteDate").value || null, created_by: myId
    });
    if (res.error) { P.showMsg(msg, "Could not save the notes: " + res.error.message); return; }
    eg_el("eg_noteTitle").value = ""; eg_el("eg_noteBody").value = "";
    P.showMsg(msg, "Meeting notes saved.", "ok");
    await eg_loadNotes();
  });

  /* ---------- #38 Officials group thread ---------- */
  var eg_thread = [];
  async function eg_loadThread() {
    if (!P.isOfficialOrAbove()) return;
    var res = await client.from("messages").select("*")
      .eq("kind", "dm").eq("audience", "officials").eq("subject", "Officials thread")
      .order("created_at", { ascending: true }).limit(100);
    if (res.error) return;
    eg_thread = res.data || [];
    var list = eg_el("eg_threadList");
    if (!list) return;
    if (!eg_thread.length) { list.innerHTML = '<p class="empty">No messages in the officials thread yet. Say hello.</p>'; return; }
    list.innerHTML = eg_thread.map(function (m) {
      return '<div class="row-item">' + P.avatarHtml(P.directoryById ? P.directoryById[m.sender_id] : null) +
        '<div class="body"><b>' + eg_esc(eg_memberName(m.sender_id)) + "</b>" +
        '<div class="meta">' + eg_esc(P.timeAgo(m.created_at)) + "</div>" +
        "<p>" + eg_esc(m.body) + "</p></div></div>";
    }).join("");
  }
  eg_on("eg_threadForm", "submit", async function (e) {
    e.preventDefault();
    var body = eg_el("eg_threadBody").value.trim();
    var msg = eg_el("eg_threadMsg");
    if (!body) { P.showMsg(msg, "Write a message first."); return; }
    var res = await client.from("messages").insert({
      sender_id: myId, recipient_id: null, kind: "dm",
      audience: "officials", subject: "Officials thread", body: body
    });
    if (res.error) { P.showMsg(msg, "Could not send: " + res.error.message); return; }
    eg_el("eg_threadBody").value = "";
    await eg_loadThread();
  });

  /* ---------- #49 Social media planner ---------- */
  var eg_social = [];
  async function eg_loadSocial() {
    if (!eg_canSeeSocial()) return;
    var res = await client.from("social_posts").select("*").order("scheduled_for", { ascending: true }).limit(100);
    if (res.error) return;
    eg_social = res.data || [];
    var list = eg_el("eg_socialList");
    if (!list) return;
    if (!eg_social.length) { list.innerHTML = '<p class="empty">Nothing planned yet.</p>'; return; }
    list.innerHTML = eg_social.map(function (s) {
      return '<div class="row-item"><div class="body"><b>' + eg_esc(s.platform) + "</b> " +
        '<span class="chip' + (s.status === "posted" ? "" : s.status === "ready" ? " orange" : " ghost") + '">' + eg_esc(s.status) + "</span>" +
        '<div class="meta">' + (s.scheduled_for ? "Scheduled " + eg_esc(new Date(s.scheduled_for).toLocaleString()) + " &middot; " : "") +
        (s.assignee_id ? "Posts: " + eg_esc(eg_memberName(s.assignee_id)) : "Unassigned") + "</div>" +
        "<p>" + eg_esc(s.caption || "") + "</p></div>" +
        (eg_canPlanSocial() && s.status !== "posted" ? '<div class="actions">' +
          '<button class="btn ghost small" type="button" data-eg-action="eg-social-status" data-eg-id="' + eg_esc(s.id) + '" data-eg-next="' + (s.status === "draft" ? "ready" : "posted") + '">' +
          (s.status === "draft" ? "Mark ready" : "Mark posted") + "</button></div>" : "") +
        "</div>";
    }).join("");
  }
  eg_on("eg_socialForm", "submit", async function (e) {
    e.preventDefault();
    var caption = eg_el("eg_socialCaption").value.trim();
    var msg = eg_el("eg_socialMsg");
    if (!caption) { P.showMsg(msg, "Write the caption first."); return; }
    var when = eg_el("eg_socialWhen").value;
    var res = await client.from("social_posts").insert({
      platform: eg_el("eg_socialPlatform").value, caption: caption,
      scheduled_for: when ? new Date(when).toISOString() : null,
      assignee_id: eg_el("eg_socialAssignee").value || null,
      status: "draft"
    });
    if (res.error) { P.showMsg(msg, "Could not save the post: " + res.error.message); return; }
    eg_el("eg_socialCaption").value = "";
    P.showMsg(msg, "Post planned.", "ok");
    await eg_loadSocial();
  });

  /* ---------- #60 Club wall (+ reactions via wall_reactions) ---------- */
  var eg_wall = [];
  var eg_wallReactions = {}; /* post_id -> {emoji: count, mine: {emoji: true}} */
  async function eg_loadWall() {
    var res = await client.from("club_wall_posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (res.error) return;
    eg_wall = (res.data || []).filter(function (p) { return !p.hidden || eg_canModerateWall(); });
    var rres = await client.from("wall_reactions").select("post_id,member_id,emoji");
    eg_wallReactions = {};
    if (!rres.error && rres.data) rres.data.forEach(function (r) {
      eg_wallReactions[r.post_id] = eg_wallReactions[r.post_id] || {};
      eg_wallReactions[r.post_id][r.emoji] = (eg_wallReactions[r.post_id][r.emoji] || 0) + 1;
      if (r.member_id === myId) {
        eg_wallReactions[r.post_id].mine = eg_wallReactions[r.post_id].mine || {};
        eg_wallReactions[r.post_id].mine[r.emoji] = true;
      }
    });
    eg_renderWall();
  }
  function eg_renderWall() {
    var list = eg_el("eg_wallList");
    if (!list) return;
    var visible = eg_wall.filter(function (p) { return !p.hidden; });
    if (!visible.length) { list.innerHTML = '<p class="empty">Nothing on the wall yet. Be the first to post.</p>'; return; }
    list.innerHTML = visible.map(function (p) {
      var rc = eg_wallReactions[p.id] || {};
      var btns = ["👍", "❤️", "🔥"].map(function (em) {
        var n = rc[em] || 0;
        var mine = rc.mine && rc.mine[em];
        return '<button class="btn ghost small eg-react' + (mine ? " eg-react-on" : "") + '" type="button" data-eg-action="eg-wall-react" data-eg-id="' + eg_esc(p.id) + '" data-eg-emoji="' + em + '">' + em + " " + n + "</button>";
      }).join("");
      return '<div class="row-item">' + P.avatarHtml(P.directoryById ? P.directoryById[p.member_id] : null) +
        '<div class="body"><b>' + eg_esc(eg_memberName(p.member_id)) + "</b>" +
        '<div class="meta">' + eg_esc(P.timeAgo(p.created_at)) + "</div>" +
        (p.image_url ? '<p><img class="eg-wall-img" src="' + eg_esc(p.image_url) + '" alt="Wall photo" /></p>' : "") +
        "<p>" + eg_esc(p.body) + "</p>" +
        '<div class="eg-react-row">' + btns + "</div></div>" +
        (eg_canModerateWall() ? '<div class="actions">' +
          '<button class="btn ghost small" type="button" data-eg-action="eg-wall-hide" data-eg-id="' + eg_esc(p.id) + '">Hide</button>' +
          (P.isMainAdmin() ? '<button class="btn ghost small" type="button" data-eg-action="eg-wall-delete" data-eg-id="' + eg_esc(p.id) + '">Delete</button>' : "") +
          "</div>" : "") +
        "</div>";
    }).join("");
  }
  eg_on("eg_wallForm", "submit", async function (e) {
    e.preventDefault();
    var body = eg_el("eg_wallBody").value.trim();
    var msg = eg_el("eg_wallMsg");
    if (!body && !eg_el("eg_wallFile").files.length) { P.showMsg(msg, "Write something or add a photo."); return; }
    var imageUrl = null;
    var file = eg_el("eg_wallFile").files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { P.showMsg(msg, "Photo must be under 5 MB."); return; }
      var path = "wall/" + myId + "-" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var up = await client.storage.from("club-files").upload(path, file);
      if (up.error) { P.showMsg(msg, "Could not upload the photo: " + up.error.message); return; }
      var pub = client.storage.from("club-files").getPublicUrl(path);
      imageUrl = pub.data ? pub.data.publicUrl : null;
    }
    var res = await client.from("club_wall_posts").insert({
      member_id: myId, body: body, image_url: imageUrl, hidden: false
    });
    if (res.error) { P.showMsg(msg, "Could not post: " + res.error.message); return; }
    eg_el("eg_wallBody").value = ""; eg_el("eg_wallFile").value = "";
    P.showMsg(msg, "Posted to the wall.", "ok");
    await eg_loadWall();
  });

  /* ---------- #62 Song / music suggestions ---------- */
  var eg_songs = [];
  async function eg_loadSongs() {
    var res = await client.from("song_suggestions").select("*").order("created_at", { ascending: false }).limit(100);
    if (res.error) return;
    eg_songs = res.data || [];
    var list = eg_el("eg_songList");
    if (!list) return;
    if (!eg_songs.length) { list.innerHTML = '<p class="empty">No song suggestions yet.</p>'; return; }
    list.innerHTML = eg_songs.map(function (s) {
      return '<div class="row-item"><div class="body"><b>' + eg_esc(s.title) + "</b>" +
        (s.artist ? " <span class=\"muted\">— " + eg_esc(s.artist) + "</span>" : "") +
        '<div class="meta">Suggested by ' + eg_esc(eg_memberName(s.member_id)) + " &middot; " + eg_esc(P.timeAgo(s.created_at)) + "</div>" +
        (s.note ? "<p>" + eg_esc(s.note) + "</p>" : "") +
        (s.link ? '<p><a href="' + eg_esc(s.link) + '" target="_blank" rel="noopener">Listen</a></p>' : "") +
        "</div></div>";
    }).join("");
  }
  eg_on("eg_songForm", "submit", async function (e) {
    e.preventDefault();
    var title = eg_el("eg_songTitle").value.trim();
    var msg = eg_el("eg_songMsg");
    if (!title) { P.showMsg(msg, "Give the track a title."); return; }
    var res = await client.from("song_suggestions").insert({
      member_id: myId, title: title,
      artist: eg_el("eg_songArtist").value.trim() || null,
      link: eg_el("eg_songLink").value.trim() || null,
      note: eg_el("eg_songNote").value.trim() || null
    });
    if (res.error) { P.showMsg(msg, "Could not save the suggestion: " + res.error.message); return; }
    eg_el("eg_songTitle").value = ""; eg_el("eg_songArtist").value = ""; eg_el("eg_songLink").value = ""; eg_el("eg_songNote").value = "";
    P.showMsg(msg, "Song suggested.", "ok");
    await eg_loadSongs();
  });

  /* ---------- #74 / #79 Message templates (one mechanism, both roles) ---------- */
  var eg_templates = [];
  async function eg_loadTemplates() {
    var sel = eg_el("eg_templateSel");
    if (!sel) return;
    var res = await client.from("message_templates").select("*").eq("owner_id", myId).order("created_at", { ascending: false }).limit(50);
    if (res.error) return;
    eg_templates = res.data || [];
    sel.innerHTML = '<option value="">Use a saved reply…</option>' + eg_templates.map(function (t) {
      return '<option value="' + eg_esc(t.id) + '">' + eg_esc(t.name) + "</option>";
    }).join("");
  }
  eg_on("eg_templateSel", "change", function () {
    var t = eg_templates.filter(function (x) { return x.id === eg_el("eg_templateSel").value; })[0];
    if (!t) return;
    var body = eg_el("dmBody");
    if (body) {
      body.value = (body.value ? body.value + "\n" : "") + t.body;
      body.focus();
    }
    eg_el("eg_templateSel").value = "";
  });
  eg_on("eg_templateSaveBtn", "click", async function () {
    var body = eg_el("dmBody");
    var msg = eg_el("eg_templateMsg");
    if (!body || !body.value.trim()) { if (msg) P.showMsg(msg, "Write a message first, then save it as a template."); return; }
    var name = window.prompt("Name for this template? (e.g. Welcome note)");
    if (name === null) return;
    var res = await client.from("message_templates").insert({
      owner_id: myId, name: (name || "").trim() || "Untitled template", body: body.value.trim()
    });
    if (res.error) { if (msg) P.showMsg(msg, "Could not save the template: " + res.error.message); return; }
    if (msg) P.showMsg(msg, "Template saved.", "ok");
    await eg_loadTemplates();
  });

  /* ---------- #81 Draft autosave ---------- */
  var eg_DRAFT_DM = "rfc-draft-dm";
  var eg_DRAFT_ANN = "rfc-draft-ann";
  function eg_saveDraft(key, obj) {
    try { window.localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function eg_readDraft(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function eg_clearDraft(key) {
    try { window.localStorage.removeItem(key); } catch (e) {}
  }
  function eg_setupDrafts() {
    var dmSub = eg_el("dmSubject"), dmBody = eg_el("dmBody"), annBody = eg_el("annBody");
    var dmDraft = eg_readDraft(eg_DRAFT_DM);
    if (dmDraft) {
      if (dmSub && !dmSub.value) dmSub.value = dmDraft.subject || "";
      if (dmBody && !dmBody.value) dmBody.value = dmDraft.body || "";
    }
    var annDraft = eg_readDraft(eg_DRAFT_ANN);
    if (annDraft && annBody && !annBody.value) annBody.value = annDraft.body || "";
    if (dmSub) dmSub.addEventListener("input", function () {
      eg_saveDraft(eg_DRAFT_DM, { subject: dmSub.value, body: dmBody ? dmBody.value : "" });
    });
    if (dmBody) dmBody.addEventListener("input", function () {
      eg_saveDraft(eg_DRAFT_DM, { subject: dmSub ? dmSub.value : "", body: dmBody.value });
    });
    if (annBody) annBody.addEventListener("input", function () {
      eg_saveDraft(eg_DRAFT_ANN, { body: annBody.value });
    });
    /* Clear only when portal.js reports a successful send (its .msg turns
       green / "ok"), not on submit — a failed send keeps the draft. */
    function eg_watchMsg(id, key) {
      var m = eg_el(id);
      if (!m || !window.MutationObserver) return;
      new MutationObserver(function () {
        if ((m.className || "").indexOf(" ok") !== -1) eg_clearDraft(key);
      }).observe(m, { attributes: true, attributeFilter: ["class"] });
    }
    eg_watchMsg("dmMsg", eg_DRAFT_DM);
    eg_watchMsg("annMsg", eg_DRAFT_ANN);
  }

  /* ---------- #75 Quick applicant actions (observer on #applicantList) ----------
     Applicant rows DO carry the id: portal.js renders a <select
     data-app-stage="<id>"> and a <button data-app-convert="<id>"> per row,
     so the buttons below read the id from data-app-stage. Fallback: match
     the row's visible name against P.applicantsRows (see notes.md). */
  function eg_applicantIdFromRow(row) {
    var sel = row.querySelector("[data-app-stage]");
    if (sel) return sel.getAttribute("data-app-stage");
    var conv = row.querySelector("[data-app-convert]");
    if (conv) return conv.getAttribute("data-app-convert");
    var nameEl = row.querySelector(".body b");
    var name = nameEl ? nameEl.textContent.trim() : "";
    var hit = (P.applicantsRows || []).filter(function (a) { return a.name === name; })[0];
    return hit ? hit.id : null;
  }
  function eg_decorateApplicants() {
    var box = eg_el("applicantList");
    if (!box) return;
    if (!(P.isMainAdmin() || eg_isRole("president") || eg_isRole("vice_president"))) return;
    var rows = box.querySelectorAll(".row-item");
    rows.forEach(function (row) {
      if (row.getAttribute("data-eg-app")) return;
      row.setAttribute("data-eg-app", "1");
      var id = eg_applicantIdFromRow(row);
      if (!id) return;
      var actions = row.querySelector(".actions");
      if (!actions) return;
      var mk = function (label, status) {
        var b = document.createElement("button");
        b.className = "btn ghost small";
        b.type = "button";
        b.textContent = label;
        b.setAttribute("data-eg-action", "eg-app-quick");
        b.setAttribute("data-eg-id", id);
        b.setAttribute("data-eg-status", status);
        return b;
      };
      actions.appendChild(mk("Shortlist", "shortlisted"));
      actions.appendChild(mk("Contacted", "contacted"));
    });
  }

  /* ---------- #77 / #78 Inbox post-processing (observer on #inboxList) ----------
     portal.js renders inbox rows with NO id on the row itself. The message
     id is recovered (1) from a data-read / data-msg-delete button inside
     the row when present, else (2) by row order against P.inboxItems —
     see notes.md: order matching breaks for the Main Admin's search/filter
     and for a sender's collapsed broadcast rows, so #77/#78 skip rows
     they cannot identify. */
  var eg_pinnedPeers = {}; /* peer_id -> true (mine) */
  var eg_reordering = false;
  async function eg_loadPins() {
    var res = await client.from("pinned_conversations").select("peer_id").eq("owner_id", myId);
    eg_pinnedPeers = {};
    if (!res.error && res.data) res.data.forEach(function (r) { eg_pinnedPeers[r.peer_id] = true; });
  }
  function eg_inboxItemForRow(row, index) {
    var btn = row.querySelector("[data-read]") || row.querySelector("[data-msg-delete]");
    var id = btn ? (btn.getAttribute("data-read") || btn.getAttribute("data-msg-delete")) : null;
    if (id) {
      var hit = (P.inboxItems || []).filter(function (m) { return m.id === id; })[0];
      if (hit) return hit;
    }
    /* Fallback: row order. Valid for recipients (no broadcast collapse)
       with no inbox search/filter active; skipped when it cannot match. */
    var items = P.inboxItems || [];
    if (index >= 0 && index < items.length) return items[index];
    return null;
  }
  function eg_decorateInbox() {
    var box = eg_el("inboxList");
    if (!box || eg_reordering) return;
    var rows = box.querySelectorAll(".row-item");
    var decorated = [];
    rows.forEach(function (row, i) {
      var m = eg_inboxItemForRow(row, i);
      var pinned = false;
      var peer = null;
      if (m) {
        if (m.kind === "dm") {
          peer = m.sender_id === myId ? m.recipient_id : m.sender_id;
          /* Broadcast copies (audience 'members', sent by me) have no
             single peer — never pin them. */
          if (m.audience === "members" && m.sender_id === myId) peer = null;
        }
        pinned = !!(peer && eg_pinnedPeers[peer]);
      }
      if (!row.getAttribute("data-eg-inbox")) {
        row.setAttribute("data-eg-inbox", "1");
        var actions = row.querySelector(".actions");
        if (!actions) {
          actions = document.createElement("div");
          actions.className = "actions";
          row.appendChild(actions);
        }
        if (m && (m.recipient_id === myId || m.kind === "report")) {
          var unreadBtn = document.createElement("button");
          unreadBtn.className = "btn ghost small";
          unreadBtn.type = "button";
          unreadBtn.textContent = "Mark unread";
          unreadBtn.setAttribute("data-eg-action", "eg-mark-unread");
          unreadBtn.setAttribute("data-eg-id", m.id);
          actions.appendChild(unreadBtn);
        }
        if (peer) {
          var pinBtn = document.createElement("button");
          pinBtn.className = "btn ghost small";
          pinBtn.type = "button";
          pinBtn.textContent = pinned ? "Unpin" : "Pin";
          pinBtn.setAttribute("data-eg-action", "eg-pin-toggle");
          pinBtn.setAttribute("data-eg-peer", peer);
          actions.appendChild(pinBtn);
        }
      }
      decorated.push({ row: row, pinned: pinned });
    });
    /* #78: move pinned peers' rows to the top, keeping their order. */
    var anyPinned = decorated.some(function (d) { return d.pinned; });
    if (!anyPinned) return;
    var first = decorated[0];
    if (first.pinned) {
      var inOrder = true;
      var seenUnpinned = false;
      decorated.forEach(function (d) {
        if (!d.pinned) seenUnpinned = true;
        else if (seenUnpinned) inOrder = false;
      });
      if (inOrder) return;
    }
    eg_reordering = true;
    var pinnedRows = decorated.filter(function (d) { return d.pinned; }).map(function (d) { return d.row; });
    var rest = decorated.filter(function (d) { return !d.pinned; }).map(function (d) { return d.row; });
    pinnedRows.forEach(function (r) {
      var b = r.querySelector(".body b");
      if (b && !b.querySelector(".eg-pin-mark")) {
        var mark = document.createElement("span");
        mark.className = "chip orange eg-pin-mark";
        mark.textContent = "📌 Pinned";
        b.appendChild(document.createTextNode(" "));
        b.appendChild(mark);
      }
      box.insertBefore(r, box.firstChild);
    });
    /* Keep pinned rows in their original relative order at the top. */
    pinnedRows.forEach(function (r) { box.insertBefore(r, rest[0] || null); });
    eg_reordering = false;
  }

  /* ---------- #80 Who's online (best-effort; see notes.md) ---------- */
  var eg_lastSeen = null; /* null = not loaded yet; {} = loaded (maybe empty) */
  async function eg_loadLastSeen() {
    var res = await client.from("profiles").select("id,last_seen_at");
    if (res.error) { eg_lastSeen = {}; return; } /* RLS blocked: no dots, no faking. */
    eg_lastSeen = {};
    (res.data || []).forEach(function (p) { eg_lastSeen[p.id] = p.last_seen_at; });
    eg_applyOnlineDots();
  }
  function eg_applyOnlineDots() {
    if (eg_lastSeen === null) return;
    var box = eg_el("memberList");
    if (!box) return;
    box.querySelectorAll(".row-item").forEach(function (row) {
      if (row.getAttribute("data-eg-online")) return;
      var btn = row.querySelector("[data-message]") || row.querySelector("[data-contact]");
      if (!btn) return;
      var id = btn.getAttribute("data-message") || btn.getAttribute("data-contact");
      var seen = eg_lastSeen[id];
      row.setAttribute("data-eg-online", "1");
      if (!seen) return;
      var ageMs = Date.now() - new Date(seen).getTime();
      if (ageMs < 0 || ageMs > 15 * 60 * 1000) return;
      var nameEl = row.querySelector(".body b");
      if (!nameEl) return;
      var dot = document.createElement("span");
      dot.className = "eg-online-dot";
      dot.title = "Online — active in the last 15 minutes";
      nameEl.appendChild(dot);
    });
  }

  /* ---------- #82 / #83 Announcement bookmarks + reactions ----------
     portal.js renders announcements via announcementHtml with NO id on the
     row (only Main Admin buttons carry data-ann-pin / data-ann-delete).
     Rows are matched to P.annRows BY ORDER: the nth .row-item in
     #announceList is the nth announcement in P.annRows (after portal.js
     applies its own search filter — the filter shrinks both together, so
     order still lines up for the rendered set only if the filter is the
     portal search; see notes.md for the risk). #dashAnnouncements holds
     the first 5 of the same ordering. */
  var eg_bookmarks = {}; /* message_id -> true (mine) */
  var eg_annReactions = {}; /* message_id -> {emoji: count, mine: {emoji:true}} */
  var eg_savedOnly = false;
  async function eg_loadAnnExtras() {
    var bres = await client.from("announcement_bookmarks").select("message_id").eq("member_id", myId);
    eg_bookmarks = {};
    if (!bres.error && bres.data) bres.data.forEach(function (r) { eg_bookmarks[r.message_id] = true; });
    var rres = await client.from("announcement_reactions").select("message_id,member_id,emoji");
    eg_annReactions = {};
    if (!rres.error && rres.data) rres.data.forEach(function (r) {
      eg_annReactions[r.message_id] = eg_annReactions[r.message_id] || {};
      eg_annReactions[r.message_id][r.emoji] = (eg_annReactions[r.message_id][r.emoji] || 0) + 1;
      if (r.member_id === myId) {
        eg_annReactions[r.message_id].mine = eg_annReactions[r.message_id].mine || {};
        eg_annReactions[r.message_id].mine[r.emoji] = true;
      }
    });
  }
  function eg_annIdForRow(row, index, inDash) {
    var btn = row.querySelector("[data-ann-pin]") || row.querySelector("[data-ann-delete]");
    if (btn) return btn.getAttribute("data-ann-pin") || btn.getAttribute("data-ann-delete");
    var rows = P.annRows || [];
    /* Dashboard feed is the same ordering, limited to 5. */
    if (index >= 0 && index < rows.length) return rows[index].id;
    return null;
  }
  function eg_reactionBarHtml(mid) {
    var rc = eg_annReactions[mid] || {};
    return ["👍", "❤️", "🔥"].map(function (em) {
      var n = rc[em] || 0;
      var mine = rc.mine && rc.mine[em];
      return '<button class="btn ghost small eg-react' + (mine ? " eg-react-on" : "") + '" type="button" data-eg-action="eg-ann-react" data-eg-id="' + eg_esc(mid) + '" data-eg-emoji="' + em + '">' + em + " " + n + "</button>";
    }).join("");
  }
  function eg_decorateAnnList(box, inDash) {
    if (!box) return;
    var rows = box.querySelectorAll(".row-item");
    rows.forEach(function (row, i) {
      var mid = eg_annIdForRow(row, i, inDash);
      if (!mid) return;
      var body = row.querySelector(".body");
      if (!body) return;
      if (!inDash && !row.getAttribute("data-eg-bookmark")) {
        row.setAttribute("data-eg-bookmark", "1");
        var actions = row.querySelector(".actions");
        if (!actions) {
          actions = document.createElement("div");
          actions.className = "actions";
          row.appendChild(actions);
        }
        var saveBtn = document.createElement("button");
        saveBtn.className = "btn ghost small";
        saveBtn.type = "button";
        saveBtn.textContent = eg_bookmarks[mid] ? "★ Saved" : "☆ Save";
        saveBtn.setAttribute("data-eg-action", "eg-bookmark");
        saveBtn.setAttribute("data-eg-id", mid);
        actions.appendChild(saveBtn);
      }
      if (!row.querySelector(".eg-reactions")) {
        var bar = document.createElement("div");
        bar.className = "eg-react-row eg-reactions";
        bar.innerHTML = eg_reactionBarHtml(mid);
        body.appendChild(bar);
      }
      row.setAttribute("data-eg-ann", mid);
      if (eg_savedOnly && !inDash) row.style.display = eg_bookmarks[mid] ? "" : "none";
      else if (!inDash) row.style.display = "";
    });
  }
  function eg_setupSavedFilter() {
    var list = eg_el("announceList");
    if (!list || eg_el("eg_savedFilterBtn")) return;
    var btn = document.createElement("button");
    btn.id = "eg_savedFilterBtn";
    btn.className = "btn ghost small";
    btn.type = "button";
    btn.textContent = "★ Saved announcements";
    btn.setAttribute("data-eg-action", "eg-saved-filter");
    list.parentNode.insertBefore(btn, list);
  }

  /* ---------- observers (portal-owned lists re-render on refresh) ---------- */
  function eg_setupObservers() {
    if (!window.MutationObserver) {
      eg_decorateApplicants(); eg_decorateInbox(); eg_applyOnlineDots();
      eg_decorateAnnList(eg_el("announceList"), false);
      eg_decorateAnnList(eg_el("dashAnnouncements"), true);
      return;
    }
    function eg_observe(id, fn) {
      var el = eg_el(id);
      if (!el) return;
      new MutationObserver(function () { fn(); }).observe(el, { childList: true, subtree: false });
      fn();
    }
    eg_observe("applicantList", eg_decorateApplicants);
    eg_observe("inboxList", eg_decorateInbox);
    eg_observe("memberList", eg_applyOnlineDots);
    eg_observe("announceList", function () { eg_decorateAnnList(eg_el("announceList"), false); });
    eg_observe("dashAnnouncements", function () { eg_decorateAnnList(eg_el("dashAnnouncements"), true); });
  }

  /* ---------- one document-level click handler for all eg-* buttons ---------- */
  document.addEventListener("click", async function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-eg-action]") : null;
    if (!t) return;
    var action = t.getAttribute("data-eg-action");
    var id = t.getAttribute("data-eg-id");
    if (action === "eg-vote") {
      var pollId = t.getAttribute("data-eg-poll");
      var opt = parseInt(t.getAttribute("data-eg-opt"), 10);
      var res = await client.from("poll_votes").insert({ poll_id: pollId, member_id: myId, option_index: opt });
      if (res.error) { window.alert("Could not record your vote: " + res.error.message); return; }
      eg_myVotes[pollId] = opt;
      await eg_loadPolls();
    } else if (action === "eg-task-done" || action === "eg-task-reopen") {
      var next = action === "eg-task-done" ? "done" : "pending";
      var r = await client.from("tasks").update({ status: next }).eq("id", id);
      if (r.error) { window.alert("Could not update the task: " + r.error.message); return; }
      await eg_loadTasks();
    } else if (action === "eg-leave-approve" || action === "eg-leave-decline") {
      var st = action === "eg-leave-approve" ? "approved" : "declined";
      var lr = await client.from("leave_requests").update({ status: st, decided_by: myId }).eq("id", id);
      if (lr.error) { window.alert("Could not decide the request: " + lr.error.message); return; }
      await eg_loadLeaves();
    } else if (action === "eg-sugg-planned" || action === "eg-sugg-done") {
      var sst = action === "eg-sugg-planned" ? "planned" : "done";
      var sr = await client.from("suggestions").update({ status: sst }).eq("id", id);
      if (sr.error) { window.alert("Could not update the suggestion: " + sr.error.message); return; }
      await eg_loadSuggestions();
    } else if (action === "eg-social-status") {
      var sres = await client.from("social_posts").update({ status: t.getAttribute("data-eg-next") }).eq("id", id);
      if (sres.error) { window.alert("Could not update the post: " + sres.error.message); return; }
      await eg_loadSocial();
    } else if (action === "eg-wall-react") {
      var em = t.getAttribute("data-eg-emoji");
      var mine = (eg_wallReactions[id] && eg_wallReactions[id].mine && eg_wallReactions[id].mine[em]);
      var wr;
      if (mine) wr = await client.from("wall_reactions").delete().eq("post_id", id).eq("member_id", myId).eq("emoji", em);
      else wr = await client.from("wall_reactions").insert({ post_id: id, member_id: myId, emoji: em });
      if (wr.error) { window.alert("Could not react: " + wr.error.message); return; }
      await eg_loadWall();
    } else if (action === "eg-wall-hide") {
      var hr = await client.from("club_wall_posts").update({ hidden: true }).eq("id", id);
      if (hr.error) { window.alert("Could not hide the post: " + hr.error.message); return; }
      await eg_loadWall();
    } else if (action === "eg-wall-delete") {
      if (!window.confirm("Delete this wall post? This cannot be undone.")) return;
      var dr = await client.from("club_wall_posts").delete().eq("id", id);
      if (dr.error) { window.alert("Could not delete the post: " + dr.error.message); return; }
      await eg_loadWall();
    } else if (action === "eg-app-quick") {
      var qres = await client.from("applications").update({ status: t.getAttribute("data-eg-status") }).eq("id", id);
      if (qres.error) { window.alert("Could not update the application: " + qres.error.message); return; }
      await P.refreshApplicants();
    } else if (action === "eg-mark-unread") {
      var ures = await client.from("messages").update({ is_read: false }).eq("id", id);
      if (ures.error) { window.alert("Could not mark unread: " + ures.error.message); return; }
      await P.refreshInbox();
      await P.refreshDashboard();
    } else if (action === "eg-pin-toggle") {
      var peer = t.getAttribute("data-eg-peer");
      var pres;
      if (eg_pinnedPeers[peer]) pres = await client.from("pinned_conversations").delete().eq("owner_id", myId).eq("peer_id", peer);
      else pres = await client.from("pinned_conversations").insert({ owner_id: myId, peer_id: peer });
      if (pres.error) { window.alert("Could not change the pin: " + pres.error.message); return; }
      await eg_loadPins();
      /* Drop the stale decoration marks so the re-render re-decorates. */
      document.querySelectorAll("#inboxList .row-item[data-eg-inbox]").forEach(function (row) {
        row.removeAttribute("data-eg-inbox");
      });
      eg_decorateInbox();
    } else if (action === "eg-bookmark") {
      var bres;
      if (eg_bookmarks[id]) bres = await client.from("announcement_bookmarks").delete().eq("message_id", id).eq("member_id", myId);
      else bres = await client.from("announcement_bookmarks").insert({ message_id: id, member_id: myId });
      if (bres.error) { window.alert("Could not change the bookmark: " + bres.error.message); return; }
      await eg_loadAnnExtras();
      document.querySelectorAll("#announceList .row-item[data-eg-bookmark]").forEach(function (row) {
        row.removeAttribute("data-eg-bookmark");
      });
      eg_decorateAnnList(eg_el("announceList"), false);
    } else if (action === "eg-ann-react") {
      var aem = t.getAttribute("data-eg-emoji");
      var amine = (eg_annReactions[id] && eg_annReactions[id].mine && eg_annReactions[id].mine[aem]);
      var ares;
      if (amine) ares = await client.from("announcement_reactions").delete().eq("message_id", id).eq("member_id", myId).eq("emoji", aem);
      else ares = await client.from("announcement_reactions").insert({ message_id: id, member_id: myId, emoji: aem });
      if (ares.error) { window.alert("Could not react: " + ares.error.message); return; }
      await eg_loadAnnExtras();
      eg_decorateAnnList(eg_el("announceList"), false);
      eg_decorateAnnList(eg_el("dashAnnouncements"), true);
    } else if (action === "eg-saved-filter") {
      eg_savedOnly = !eg_savedOnly;
      t.textContent = eg_savedOnly ? "★ Showing saved — tap to show all" : "★ Saved announcements";
      eg_decorateAnnList(eg_el("announceList"), false);
    }
  });

  /* ---------- gating: hide club-tab sections the viewer may not use ---------- */
  function eg_applyGating() {
    eg_show(eg_el("eg_pollFormCard"), eg_canCreatePoll());
    eg_show(eg_el("eg_taskFormCard"), eg_canAssignTask());
    eg_show(eg_el("eg_suggListCard"), eg_canSeeSuggestions());
    eg_show(eg_el("eg_noteFormCard"), eg_canWriteNotes());
    eg_show(eg_el("eg_noteListCard"), eg_canSeeNotes());
    eg_show(eg_el("eg_threadCard"), P.isOfficialOrAbove());
    eg_show(eg_el("eg_socialFormCard"), eg_canPlanSocial());
    eg_show(eg_el("eg_socialListCard"), eg_canSeeSocial());
    eg_show(eg_el("eg_dashTasksCard"), true);
  }

  /* ---------- boot ---------- */
  eg_applyGating();
  eg_fillMemberSelect(eg_el("eg_taskAssignee"), "Choose a member…");
  eg_fillMemberSelect(eg_el("eg_socialAssignee"), "No assignee — Main Admin posts it");
  eg_loadPolls();
  eg_loadTasks();
  eg_loadEvents().then(function () { eg_loadLeaves(); });
  eg_loadSuggestions();
  eg_loadNotes();
  eg_loadThread();
  eg_loadSocial();
  eg_loadWall();
  eg_loadSongs();
  eg_loadTemplates();
  eg_loadPins();
  eg_loadLastSeen();
  eg_loadAnnExtras().then(function () {
    eg_setupSavedFilter();
    eg_decorateAnnList(eg_el("announceList"), false);
    eg_decorateAnnList(eg_el("dashAnnouncements"), true);
  });
  eg_setupDrafts();
  eg_setupObservers();
}



/* ================= people/people.js ================= */

/* PEOPLE package — Step 16, features 91 (#13,#14,#24,#25,#26,#27,#28,#29,
   #31,#41,#42,#47,#48,#50,#51,#59,#61,#65,#67,#70,#72,#73,#84).
   Plain ES5, matching portal.js. Runs after portal boot via f91InitPeople(P).
   Only this package defines window.__f91ProfileExtra. */
var pp_P = null;
var pp_wired = false;
var pp_clubYear = null;
var pp_obsBusy = false;
var pp_lastProfile = null;

var PP_ROLES = ["admin", "second_admin", "president", "vice_president", "secretary",
  "treasurer", "creative_director", "head_of_design", "runway_lead", "media_lead",
  "events_lead", "core_member", "member"];
var PP_REQ_STATUSES = ["pending", "approved", "declined"];
var PP_GUEST_KINDS = ["model", "judge", "guest"];

function pp_el(id) { return document.getElementById(id); }
function pp_esc(s) { return pp_P ? pp_P.esc(s) : String(s == null ? "" : s); }
function pp_msg(el, text, kind) {
  if (!el) return;
  if (pp_P) pp_P.showMsg(el, text, kind); else { el.textContent = text; el.className = "msg show " + (kind || "err"); }
}
function pp_memberName(id) {
  var rows = (pp_P.adminRows && pp_P.adminRows.length ? pp_P.adminRows : pp_P.directory) || [];
  var i, r;
  for (i = 0; i < rows.length; i++) { if (rows[i].id === id) return rows[i].name; }
  r = pp_P.directoryById ? pp_P.directoryById[id] : null;
  return r ? r.name : id;
}
function pp_roleOptions(selected) {
  return PP_ROLES.map(function (r) {
    return '<option value="' + r + '"' + (r === selected ? " selected" : "") + ">" + pp_esc(pp_P.roleLabel(r)) + "</option>";
  }).join("");
}
function pp_isPriv3() {
  var r = pp_P.me && pp_P.me.role;
  return r === "admin" || r === "president" || r === "vice_president";
}
function pp_canSeeEmergency() { return pp_isPriv3(); }
function pp_canSeeMeasurements(p) {
  if (!pp_P.me) return false;
  return pp_P.isMainAdmin() || pp_P.me.role === "head_of_design" || (p && p.id === pp_P.me.id);
}
function pp_copyText(text, btn, doneLabel) {
  function done() {
    if (!btn) return;
    var old = btn.getAttribute("data-pp-label") || btn.textContent;
    btn.setAttribute("data-pp-label", old);
    btn.textContent = doneLabel || "Copied";
    setTimeout(function () { btn.textContent = old; }, 1500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { pp_copyFallback(text); done(); });
  } else { pp_copyFallback(text); done(); }
}
function pp_copyFallback(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  ta.remove();
}
function pp_daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/* ---------------- profile modal extra hook (only this package defines it) ---------------- */
window.__f91ProfileExtra = function (P, p, full, editable) {
  if (!P || !p) return "";
  pp_P = P;
  var me = P.me;
  if (!me) return "";
  var h = "";
  var isSelf = p.id === me.id;
  var canCopy = P.isMainAdmin() || P.isSecondAdmin();

  if (full && full.is_alumni) {
    h += '<p style="margin-top:14px"><span class="chip ghost">Alumni</span> <span class="muted">This member has left / graduated. Alumni keep read-only access.</span></p>';
  }
  if (full && (full.probation_reason || full.probation_until)) {
    h += '<h2 class="sec">Probation</h2><p><span class="chip orange">On probation</span> ' +
      (full.probation_reason ? pp_esc(full.probation_reason) : "") +
      (full.probation_until ? ' &middot; until ' + pp_esc(String(full.probation_until).slice(0, 10)) : "") + "</p>";
  }
  if (full && full.membership_year && pp_clubYear && Number(full.membership_year) !== Number(pp_clubYear) && !full.is_alumni) {
    h += '<p><span class="chip orange">Membership expired</span> <span class="muted">Membership year ' + pp_esc(full.membership_year) + " — current club year is " + pp_esc(pp_clubYear) + ".</span></p>";
  }

  /* Copy contact details (#72 Main Admin, #73 Second Admin too). The
     contact object is internal to openProfile, so we fetch it ourselves
     through the get_member_contact RPC when a button is tapped. */
  if (canCopy) {
    h += '<h2 class="sec">Copy <span class="serif-i">contact details</span></h2>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost small" type="button" data-pp-copy-email="' + pp_esc(p.id) + '">Copy email</button>' +
      '<button class="btn ghost small" type="button" data-pp-copy-mobile="' + pp_esc(p.id) + '">Copy mobile</button>' +
      "</div>" +
      '<p class="muted" id="pp_copyMsg" style="margin:8px 0 0"></p>';
  }

  /* ID card (#27): Main Admin for anyone, members for themselves. */
  if (editable || isSelf) {
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">' +
      '<button class="btn ghost small" type="button" data-pp-idcard="' + pp_esc(p.id) + '">Print ID card</button>' +
      "</div>";
  }

  /* Emergency contact (#26): Main Admin edits; President / VP view.
     The RPC is async but this hook must return a string, so the values
     are filled in by pp_fillProfileExtra after the modal is in the DOM. */
  if (editable) {
    h += '<h2 class="sec">Emergency <span class="serif-i">contact</span></h2>' +
      '<p class="muted" style="margin-top:-6px">Only you, the President and the Vice Presidents can see this.</p>' +
      '<label for="pp_pfEmName">Contact name</label><input id="pp_pfEmName" type="text" placeholder="e.g. Priya Sharma (mother)" />' +
      '<label for="pp_pfEmPhone">Contact phone</label><input id="pp_pfEmPhone" type="tel" placeholder="Mobile number" />' +
      '<label for="pp_pfEmRel">Relationship</label><input id="pp_pfEmRel" type="text" placeholder="e.g. Mother" />' +
      '<button class="btn ghost small" type="button" data-pp-em-save="' + pp_esc(p.id) + '">Save emergency contact</button> <span class="muted" id="pp_pfEmMsg"></span>';
  } else if (pp_canSeeEmergency()) {
    h += '<h2 class="sec">Emergency <span class="serif-i">contact</span></h2>' +
      '<div id="pp_pfEmView"><p class="muted">Loading…</p></div>';
  }

  /* Measurements (#29): Main Admin, Head of Design, or the member. */
  if (pp_canSeeMeasurements(p)) {
    var canEditMeas = editable || isSelf;
    h += '<h2 class="sec">Model <span class="serif-i">measurements</span></h2>' +
      '<p class="muted" style="margin-top:-6px">Only you, the Main Admin and the Head of Design can see these.</p>' +
      '<div id="pp_pfMeasBox"><p class="muted">Loading…</p></div>';
    if (canEditMeas) {
      h += '<div class="grid2">' +
        '<div><label for="pp_pfMeasHeight">Height (cm)</label><input id="pp_pfMeasHeight" type="number" min="100" max="250" step="0.1" /></div>' +
        '<div><label for="pp_pfMeasChest">Chest (cm)</label><input id="pp_pfMeasChest" type="number" min="40" max="200" step="0.1" /></div>' +
        '<div><label for="pp_pfMeasWaist">Waist (cm)</label><input id="pp_pfMeasWaist" type="number" min="40" max="200" step="0.1" /></div>' +
        '<div><label for="pp_pfMeasHip">Hip (cm)</label><input id="pp_pfMeasHip" type="number" min="40" max="200" step="0.1" /></div>' +
        '<div><label for="pp_pfMeasShoe">Shoe size</label><input id="pp_pfMeasShoe" type="text" placeholder="e.g. UK 8" /></div>' +
        "</div>" +
        '<button class="btn ghost small" type="button" data-pp-meas-save="' + pp_esc(p.id) + '">Save measurements</button> <span class="muted" id="pp_pfMeasMsg"></span>';
    }
  }

  /* Show history (#61): everyone who may open the profile sees the list;
     the Main Admin can add entries. */
  h += '<h2 class="sec">Show <span class="serif-i">history</span></h2>' +
    '<div id="pp_pfHistBox"><p class="muted">Loading…</p></div>';
  if (editable) {
    h += '<div class="grid2">' +
      '<div><label for="pp_histName">Show name</label><input id="pp_histName" type="text" placeholder="e.g. Sargam 2026" /></div>' +
      '<div><label for="pp_histDate">Show date</label><input id="pp_histDate" type="date" /></div>' +
      "</div>" +
      '<label for="pp_histRole">Role in the show</label><input id="pp_histRole" type="text" placeholder="e.g. Finale walk" />' +
      '<button class="btn ghost small" type="button" data-pp-hist-add="' + pp_esc(p.id) + '">Add show</button> <span class="muted" id="pp_pfHistMsg"></span>';
  }

  /* Alumni + probation controls (#24, #51) — Main Admin only. */
  if (editable && p.role !== "admin") {
    h += '<h2 class="sec">Alumni &amp; <span class="serif-i">probation</span></h2>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
      '<button class="btn ghost small" type="button" data-pp-alumni="' + pp_esc(p.id) + '" data-pp-on="' + (full && full.is_alumni ? "0" : "1") + '">' +
      (full && full.is_alumni ? "Remove alumni status" : "Mark as alumni") + "</button>" +
      "</div>" +
      '<label for="pp_probReason">Probation reason</label><input id="pp_probReason" type="text" placeholder="e.g. Missed three rehearsals" value="' + pp_esc(full && full.probation_reason ? full.probation_reason : "") + '" />' +
      '<label for="pp_probUntil">Probation until</label><input id="pp_probUntil" type="date" value="' + pp_esc(full && full.probation_until ? String(full.probation_until).slice(0, 10) : "") + '" />' +
      '<button class="btn ghost small" type="button" data-pp-probation-save="' + pp_esc(p.id) + '">Save probation</button> ' +
      '<button class="btn ghost small" type="button" data-pp-probation-clear="' + pp_esc(p.id) + '">Clear probation</button> <span class="muted" id="pp_pfProbMsg"></span>';
  }

  pp_lastProfile = { p: p, full: full, editable: editable };
  setTimeout(function () { pp_fillProfileExtra(); }, 0);
  return h;
};

/* Async fills for the profile modal (measurements, emergency contact,
   show history). Runs after openProfile has put the HTML in the DOM. */
async function pp_fillProfileExtra() {
  var ctx = pp_lastProfile;
  if (!ctx || !pp_P) return;
  var P = pp_P, p = ctx.p;
  var box, res, row, i, html;

  /* Measurements — only for the roles allowed to see them. */
  box = pp_el("pp_pfMeasBox");
  if (box && pp_canSeeMeasurements(p)) {
    res = await P.client.from("measurements").select("*").eq("member_id", p.id).maybeSingle();
    row = (!res.error && res.data) ? res.data : null;
    if (row) {
      html = '<p class="contact-line">Height: ' + pp_esc(row.height_cm == null ? "—" : row.height_cm + " cm") +
        "  •  Chest: " + pp_esc(row.chest_cm == null ? "—" : row.chest_cm + " cm") +
        "  •  Waist: " + pp_esc(row.waist_cm == null ? "—" : row.waist_cm + " cm") +
        "  •  Hip: " + pp_esc(row.hip_cm == null ? "—" : row.hip_cm + " cm") +
        "  •  Shoe: " + pp_esc(row.shoe_size || "—") + "</p>";
      if (pp_el("pp_pfMeasHeight")) pp_el("pp_pfMeasHeight").value = row.height_cm == null ? "" : row.height_cm;
      if (pp_el("pp_pfMeasChest")) pp_el("pp_pfMeasChest").value = row.chest_cm == null ? "" : row.chest_cm;
      if (pp_el("pp_pfMeasWaist")) pp_el("pp_pfMeasWaist").value = row.waist_cm == null ? "" : row.waist_cm;
      if (pp_el("pp_pfMeasHip")) pp_el("pp_pfMeasHip").value = row.hip_cm == null ? "" : row.hip_cm;
      if (pp_el("pp_pfMeasShoe")) pp_el("pp_pfMeasShoe").value = row.shoe_size || "";
    } else {
      html = '<p class="muted">No measurements recorded yet.</p>';
    }
    box.innerHTML = html;
  }

  /* Emergency contact — Main Admin edit form, President / VP read-only. */
  if (pp_el("pp_pfEmName") || pp_el("pp_pfEmView")) {
    res = await P.client.rpc("get_emergency_contact", { p_id: p.id });
    var ec = (!res.error && res.data && res.data[0]) ? res.data[0] : { name: null, phone: null, relation: null };
    if (pp_el("pp_pfEmName")) {
      pp_el("pp_pfEmName").value = ec.name || "";
      pp_el("pp_pfEmPhone").value = ec.phone || "";
      pp_el("pp_pfEmRel").value = ec.relation || "";
    }
    if (pp_el("pp_pfEmView")) {
      pp_el("pp_pfEmView").innerHTML = (ec.name || ec.phone || ec.relation)
        ? '<p class="contact-line">' + pp_esc(ec.name || "—") + " (" + pp_esc(ec.relation || "—") + ")  •  " + pp_esc(ec.phone || "—") + "</p>"
        : '<p class="muted">No emergency contact recorded for this member.</p>';
    }
  }

  /* Show history. */
  box = pp_el("pp_pfHistBox");
  if (box) {
    res = await P.client.from("show_history").select("*").eq("member_id", p.id).order("show_date", { ascending: false });
    if (res.error) { box.innerHTML = '<p class="muted">Could not load show history.</p>'; }
    else if (!res.data || !res.data.length) { box.innerHTML = '<p class="muted">No shows recorded yet.</p>'; }
    else {
      html = "";
      for (i = 0; i < res.data.length; i++) {
        html += '<div class="meta" style="margin-bottom:6px"><b>' + pp_esc(res.data[i].show_name) + "</b>" +
          (res.data[i].show_date ? " &middot; " + pp_esc(String(res.data[i].show_date).slice(0, 10)) : "") +
          (res.data[i].role_text ? " &middot; " + pp_esc(res.data[i].role_text) : "") + "</div>";
      }
      box.innerHTML = html;
    }
  }
}

/* ---------------- ID card (#27) ---------------- */
function pp_openIdCard(memberId) {
  var P = pp_P;
  var p = (P.directoryById && P.directoryById[memberId]) || null;
  var full = null;
  var i;
  for (i = 0; i < (P.adminRows || []).length; i++) { if (P.adminRows[i].id === memberId) full = P.adminRows[i]; }
  var row = full || p;
  if (!row) { alert("Could not find that member."); return; }
  var photo = row.avatar_url
    ? '<img class="pp-idcard-photo" src="' + P.esc(row.avatar_url) + '" alt="" />'
    : '<div class="pp-idcard-photo pp-idcard-initials">' + P.esc(P.initials(row.name)) + "</div>";
  var w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print the ID card."); return; }
  w.document.write(
    "<!doctype html><html><head><meta charset=\"utf-8\" /><title>ID card — " + P.esc(row.name) + "</title><style>" +
    "body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#eee;color:#111}" +
    ".pp-idcard{width:340px;margin:40px auto;background:#fff;border:1px solid #ccc;border-radius:16px;overflow:hidden}" +
    ".pp-idcard-head{background:#0d0c0a;color:#f4efe4;padding:18px 20px}" +
    ".pp-idcard-head b{display:block;font-size:18px;letter-spacing:.04em;text-transform:uppercase}" +
    ".pp-idcard-head span{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#ff9a3d}" +
    ".pp-idcard-body{padding:20px;text-align:center}" +
    ".pp-idcard-photo{width:110px;height:110px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 14px}" +
    ".pp-idcard-initials{display:grid;place-items:center;background:#0d0c0a;color:#ff9a3d;font-size:40px;font-weight:900}" +
    ".pp-idcard-name{font-size:20px;font-weight:900;margin:0 0 4px}" +
    ".pp-idcard-role{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#cf4a0e}" +
    ".pp-idcard-meta{font-size:12px;color:#555;margin-top:12px;line-height:1.9}" +
    ".pp-idcard-print{margin:0 auto 24px;display:block;padding:10px 22px;font-size:14px;cursor:pointer}" +
    "@media print{body{background:#fff}.pp-idcard{margin:0}.pp-idcard-print{display:none}}" +
    "</style></head><body>" +
    '<div class="pp-idcard"><div class="pp-idcard-head"><b>REVA Fashion Club</b><span>Team Narcissa &middot; Member ID</span></div>' +
    '<div class="pp-idcard-body">' + photo +
    '<p class="pp-idcard-name">' + P.esc(row.name) + "</p>" +
    '<p class="pp-idcard-role">' + P.esc(P.roleLabel(row.role)) + "</p>" +
    '<p class="pp-idcard-meta">REVA University &middot; Bengaluru<br />' +
    (row.login_id && (P.isMainAdmin() || row.id === P.me.id) ? "Login ID: " + P.esc(row.login_id) + "<br />" : "") +
    "Issued by the REVA Fashion Club</p></div></div>" +
    '<button class="pp-idcard-print" onclick="window.print()">Print ID card</button>' +
    "</body></html>");
  w.document.close();
}

/* ---------------- applicants observer (#13, #14) ---------------- */
/* Assumption (see notes.md): portal.js renders each applicant as a
   .row-item whose stage <select> carries data-app-stage="<applicant id>".
   We match rows by that id — never by name alone. */
function pp_enhanceApplicants() {
  var list = pp_el("applicantList");
  if (!list || !pp_P) return;
  var rows = list.querySelectorAll(".row-item");
  var i, sel, id, a, j, extra, note, date;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute("data-pp-app-done")) continue;
    sel = rows[i].querySelector("[data-app-stage]");
    if (!sel) continue;
    id = sel.getAttribute("data-app-stage");
    a = null;
    for (j = 0; j < (pp_P.applicantsRows || []).length; j++) {
      if (pp_P.applicantsRows[j].id === id) { a = pp_P.applicantsRows[j]; break; }
    }
    if (!a) continue;
    rows[i].setAttribute("data-pp-app-done", "1");
    extra = document.createElement("div");
    extra.className = "pp-app-extra";
    extra.innerHTML =
      '<label for="pp_note_' + pp_esc(id) + '">Interview note (private — only Main Admin, President, VP)</label>' +
      '<textarea id="pp_note_' + pp_esc(id) + '" placeholder="Private interview note…" style="min-height:60px">' + pp_esc(a.interview_note || "") + "</textarea>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="btn ghost small" type="button" data-pp-app-note-save="' + pp_esc(id) + '">Save note</button></div>' +
      '<label for="pp_aud_' + pp_esc(id) + '">Audition date</label>' +
      '<input id="pp_aud_' + pp_esc(id) + '" type="date" value="' + pp_esc(a.audition_date ? String(a.audition_date).slice(0, 10) : "") + '" />' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost small" type="button" data-pp-app-aud-save="' + pp_esc(id) + '">Save audition date &amp; shortlist</button>' +
      (a.status === "shortlisted" ? '<span class="chip orange">Shortlisted</span>' : "") +
      "</div>" +
      '<p class="muted" id="pp_appmsg_' + pp_esc(id) + '" style="margin:8px 0 0"></p>';
    rows[i].querySelector(".body").appendChild(extra);
  }
}

/* ---------------- admin-list observer (#25, #51, #72, #73) ---------------- */
/* Assumption (see notes.md): portal.js renders each admin row as a
   .row-item containing a button with data-profile="<member id>" (and a
   bulk checkbox data-bulk="<id>"). We match rows by that id — never by
   name alone. The chips/buttons are appended once per row (data-pp-admin-done). */
function pp_enhanceAdminList() {
  var list = pp_el("adminList");
  if (!list || !pp_P) return;
  var canCopy = pp_P.isMainAdmin() || pp_P.isSecondAdmin();
  var rows = list.querySelectorAll(".row-item");
  var i, btn, id, full, j, body, chip, wrap;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute("data-pp-admin-done")) continue;
    btn = rows[i].querySelector("[data-profile]") || rows[i].querySelector("[data-bulk]");
    if (!btn) continue;
    id = btn.getAttribute("data-profile") || btn.getAttribute("data-bulk");
    full = null;
    for (j = 0; j < (pp_P.adminRows || []).length; j++) {
      if (pp_P.adminRows[j].id === id) { full = pp_P.adminRows[j]; break; }
    }
    if (!full) continue;
    rows[i].setAttribute("data-pp-admin-done", "1");
    body = rows[i].querySelector(".body");
    if (!body) continue;
    if (pp_clubYear && full.membership_year && Number(full.membership_year) !== Number(pp_clubYear) && !full.is_alumni) {
      chip = document.createElement("span");
      chip.className = "chip orange";
      chip.textContent = "Expired";
      body.appendChild(chip);
      body.appendChild(document.createTextNode(" "));
    }
    if (full.is_alumni) {
      chip = document.createElement("span");
      chip.className = "chip ghost";
      chip.textContent = "Alumni";
      body.appendChild(chip);
      body.appendChild(document.createTextNode(" "));
    }
    if (full.probation_reason || full.probation_until) {
      chip = document.createElement("span");
      chip.className = "chip orange";
      chip.textContent = "Probation";
      body.appendChild(chip);
      body.appendChild(document.createTextNode(" "));
    }
    if (canCopy) {
      wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
      wrap.innerHTML =
        '<button class="btn ghost small" type="button" data-pp-copy-email="' + pp_esc(id) + '">Copy email</button>' +
        '<button class="btn ghost small" type="button" data-pp-copy-mobile="' + pp_esc(id) + '">Copy mobile</button>';
      body.appendChild(wrap);
    }
  }
  pp_renderAlumni();
  pp_fillRecyclePickers();
}

/* ---------------- alumni (#24) ---------------- */
function pp_renderAlumni() {
  var box = pp_el("pp_alumniList");
  if (!box || !pp_P.isMainAdmin()) return;
  var list = (pp_P.adminRows || []).filter(function (r) { return r.is_alumni; });
  if (!list.length) { box.innerHTML = '<p class="empty">No alumni yet. Mark a member as alumni from their profile.</p>'; return; }
  box.innerHTML = list.map(function (r) {
    return '<div class="row-item">' + pp_P.avatarHtml(r) +
      '<div class="body"><b>' + pp_esc(r.name) + "</b> " +
      '<span class="chip ghost">' + pp_esc(pp_P.roleLabel(r.role)) + "</span>" +
      '<div class="meta">Alumni — read-only access kept</div></div>' +
      '<div class="actions"><button class="btn ghost small" type="button" data-pp-alumni="' + pp_esc(r.id) + '" data-pp-on="0">Remove alumni status</button></div></div>';
  }).join("");
}

/* ---------------- club year & renewals (#25) ---------------- */
async function pp_loadClubYear() {
  var res = await pp_P.client.rpc("get_club_year");
  if (!res.error && res.data != null) {
    pp_clubYear = res.data;
    if (pp_el("pp_clubYearNow")) pp_el("pp_clubYearNow").textContent = String(res.data);
    if (pp_el("pp_clubYearInput")) pp_el("pp_clubYearInput").value = res.data;
  } else if (pp_el("pp_clubYearNow")) {
    pp_el("pp_clubYearNow").textContent = "not set yet";
  }
}
async function pp_bulkRenew() {
  var year = pp_clubYear || parseInt((pp_el("pp_clubYearInput") || {}).value, 10);
  if (!year) { pp_msg(pp_el("pp_yearMsg"), "Set the club year first."); return; }
  var targets = (pp_P.adminRows || []).filter(function (r) { return !r.is_alumni && !r.deleted_at; });
  if (!targets.length) { pp_msg(pp_el("pp_yearMsg"), "No members to renew."); return; }
  if (!window.confirm("Renew " + targets.length + " members for club year " + year + "?")) return;
  var done = 0, failed = 0;
  var prog = pp_el("pp_renewProgress");
  for (var i = 0; i < targets.length; i++) {
    var res = await pp_P.client.from("profiles").update({ membership_year: year }).eq("id", targets[i].id);
    if (res.error) failed++; else done++;
    if (prog) prog.textContent = "Renewing… " + (i + 1) + " of " + targets.length + " (" + done + " done, " + failed + " failed)";
  }
  if (prog) prog.textContent = "";
  pp_msg(pp_el("pp_yearMsg"), "Renewed " + done + " member" + (done === 1 ? "" : "s") + " for " + year + (failed ? ". " + failed + " failed — check their rows in the Admin list." : "."), failed ? "err" : "ok");
  await pp_P.refreshAdminList();
  pp_enhanceAdminList();
}

/* ---------------- costumes (#28, #42) ---------------- */
async function pp_renderCostumes() {
  var box = pp_el("pp_costumeList");
  if (!box) return;
  var res = await pp_P.client.from("costumes").select("*").order("created_at", { ascending: false });
  if (res.error) { box.innerHTML = '<p class="empty">Could not load costumes: ' + pp_esc(res.error.message) + "</p>"; return; }
  if (!res.data || !res.data.length) { box.innerHTML = '<p class="empty">No costumes or props yet.</p>'; return; }
  var memberOpts = '<option value="">Assign to…</option>' + (pp_P.directory || []).map(function (m) {
    return '<option value="' + pp_esc(m.id) + '">' + pp_esc(m.name) + "</option>";
  }).join("");
  box.innerHTML = res.data.map(function (c) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(c.name) + "</b> " +
      '<span class="chip' + (c.status === "assigned" ? " orange" : " ghost") + '">' + pp_esc(c.status || "available") + "</span>" +
      '<div class="meta">' + (c.size ? "Size " + pp_esc(c.size) + " &middot; " : "") + (c.description ? pp_esc(c.description) : "") + "</div>" +
      (c.assigned_to ? '<div class="meta">With: ' + pp_esc(pp_memberName(c.assigned_to)) + "</div>" : "") +
      (c.note ? '<p>' + pp_esc(c.note) + "</p>" : "") +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">' +
      '<select data-pp-cost-assign-sel="' + pp_esc(c.id) + '" style="width:auto;margin:0">' + memberOpts + "</select>" +
      '<button class="btn ghost small" type="button" data-pp-cost-assign="' + pp_esc(c.id) + '">Assign</button>' +
      (c.status === "assigned" ? '<button class="btn ghost small" type="button" data-pp-cost-return="' + pp_esc(c.id) + '">Mark returned</button>' : "") +
      "</div></div></div>";
  }).join("");
}
async function pp_renderMyCostume() {
  var box = pp_el("pp_myCostumeList");
  if (!box) return;
  var res = await pp_P.client.from("costumes").select("*").eq("assigned_to", pp_P.me.id).order("created_at", { ascending: false });
  if (res.error) { box.innerHTML = '<p class="empty">Could not load your costume.</p>'; return; }
  if (!res.data || !res.data.length) { box.innerHTML = '<p class="empty">No costume is assigned to you right now.</p>'; return; }
  box.innerHTML = res.data.map(function (c) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(c.name) + "</b> " +
      '<span class="chip orange">' + pp_esc(c.status || "assigned") + "</span>" +
      '<div class="meta">' + (c.size ? "Size " + pp_esc(c.size) + " &middot; " : "") + (c.description ? pp_esc(c.description) : "") + "</div>" +
      (c.note ? "<p>" + pp_esc(c.note) + "</p>" : "") + "</div></div>";
  }).join("");
}

/* ---------------- measurements (#29, #41, #84) ---------------- */
function pp_measValues(prefix) {
  function num(id) {
    var el = pp_el(id);
    if (!el || el.value === "") return null;
    var v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  }
  function txt(id) {
    var el = pp_el(id);
    return el ? el.value.trim() : "";
  }
  return {
    height_cm: num(prefix + "Height"), chest_cm: num(prefix + "Chest"),
    waist_cm: num(prefix + "Waist"), hip_cm: num(prefix + "Hip"),
    shoe_size: txt(prefix + "Shoe") || null
  };
}
async function pp_saveMeasurements(memberId, prefix, msgEl) {
  var vals = pp_measValues(prefix);
  var res = await pp_P.client.from("measurements").upsert(
    { member_id: memberId, height_cm: vals.height_cm, chest_cm: vals.chest_cm, waist_cm: vals.waist_cm, hip_cm: vals.hip_cm, shoe_size: vals.shoe_size },
    { onConflict: "member_id" });
  if (res.error) { pp_msg(msgEl, "Could not save measurements: " + res.error.message); return false; }
  pp_msg(msgEl, "Measurements saved.", "ok");
  return true;
}
async function pp_loadMyMeasurements() {
  var res = await pp_P.client.from("measurements").select("*").eq("member_id", pp_P.me.id).maybeSingle();
  if (!res.error && res.data) {
    var r = res.data;
    if (pp_el("pp_measHeight")) pp_el("pp_measHeight").value = r.height_cm == null ? "" : r.height_cm;
    if (pp_el("pp_measChest")) pp_el("pp_measChest").value = r.chest_cm == null ? "" : r.chest_cm;
    if (pp_el("pp_measWaist")) pp_el("pp_measWaist").value = r.waist_cm == null ? "" : r.waist_cm;
    if (pp_el("pp_measHip")) pp_el("pp_measHip").value = r.hip_cm == null ? "" : r.hip_cm;
    if (pp_el("pp_measShoe")) pp_el("pp_measShoe").value = r.shoe_size || "";
  }
  return (!res.error && res.data) ? res.data : null;
}

/* ---------------- trophy wall (#47) ---------------- */
async function pp_renderTrophies() {
  var res = await pp_P.client.from("trophy_wall").select("*").order("year", { ascending: false }).order("created_at", { ascending: false }).limit(20);
  var html;
  if (res.error) html = '<p class="empty">Could not load the trophy wall: ' + pp_esc(res.error.message) + "</p>";
  else if (!res.data || !res.data.length) html = '<p class="empty">No wins recorded yet.</p>';
  else html = res.data.map(function (t) {
    return '<div class="row-item">' +
      (t.photo_url ? '<div class="avatar has-photo"><img src="' + pp_esc(t.photo_url) + '" alt="" /></div>' : '<div class="avatar" aria-hidden="true">🏆</div>') +
      '<div class="body"><b>' + pp_esc(t.title) + "</b> " +
      '<span class="chip ghost">' + pp_esc(t.year) + "</span>" +
      '<div class="meta">' + pp_esc(t.event_name || "") + "</div>" +
      (t.note ? "<p>" + pp_esc(t.note) + "</p>" : "") + "</div>" +
      (pp_P.isMainAdmin() ? '<div class="actions"><button class="btn ghost small" type="button" data-pp-trophy-del="' + pp_esc(t.id) + '">Remove</button></div>' : "") +
      "</div>";
  }).join("");
  if (pp_el("pp_trophyDashList")) pp_el("pp_trophyDashList").innerHTML = html;
  if (pp_el("pp_trophyList")) pp_el("pp_trophyList").innerHTML = html;
}

/* ---------------- guests (#48) ---------------- */
async function pp_loadGuestEvents() {
  var sel = pp_el("pp_guestEventSel");
  if (!sel) return;
  var res = await pp_P.client.from("events").select("id,title,starts_at").order("starts_at", { ascending: false }).limit(50);
  if (res.error || !res.data || !res.data.length) {
    sel.innerHTML = '<option value="">No events yet — create one first</option>';
    return;
  }
  sel.innerHTML = res.data.map(function (e) {
    return '<option value="' + pp_esc(e.id) + '">' + pp_esc(e.title) + (e.starts_at ? " — " + pp_esc(String(e.starts_at).slice(0, 10)) : "") + "</option>";
  }).join("");
  pp_renderGuests();
}
async function pp_renderGuests() {
  var box = pp_el("pp_guestList");
  var sel = pp_el("pp_guestEventSel");
  if (!box || !sel || !sel.value) return;
  var res = await pp_P.client.from("guests").select("*").eq("event_id", sel.value).order("created_at", { ascending: true });
  if (res.error) { box.innerHTML = '<p class="empty">Could not load guests: ' + pp_esc(res.error.message) + "</p>"; return; }
  if (!res.data || !res.data.length) { box.innerHTML = '<p class="empty">No guests invited for this event yet.</p>'; return; }
  box.innerHTML = res.data.map(function (g) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(g.name) + "</b> " +
      '<span class="chip' + (g.status === "confirmed" ? " orange" : " ghost") + '">' + pp_esc(g.status || "pending") + "</span>" +
      '<div class="meta">' + pp_esc(g.kind || "guest") + (g.contact ? " &middot; " + pp_esc(g.contact) : "") + "</div></div>" +
      '<div class="actions">' +
      '<button class="btn ghost small" type="button" data-pp-guest-status="' + pp_esc(g.id) + '" data-pp-status="confirmed">Confirmed</button>' +
      '<button class="btn ghost small" type="button" data-pp-guest-status="' + pp_esc(g.id) + '" data-pp-status="declined">Declined</button>' +
      '<button class="btn ghost small" type="button" data-pp-guest-status="' + pp_esc(g.id) + '" data-pp-status="pending">Pending</button>' +
      "</div></div>";
  }).join("");
}

/* ---------------- constitution (#50) ---------------- */
async function pp_loadConstitution() {
  var res = await pp_P.client.rpc("get_constitution");
  var text = (!res.error && res.data != null) ? String(res.data) : "";
  if (pp_el("pp_constView")) {
    pp_el("pp_constView").innerHTML = text
      ? "<p style=\"white-space:pre-wrap\">" + pp_esc(text) + "</p>"
      : '<p class="empty">The constitution has not been written yet.</p>';
  }
  if (pp_el("pp_constText")) pp_el("pp_constText").value = text;
}

/* ---------------- role-change requests (#31) ---------------- */
/* Direct profiles role update: portal.js itself changes roles this way
   (its Admin-list role select does client.from("profiles").update({role})),
   so the same call is used here. If the database trigger/RLS ever blocks
   it, the UI shows the exact error and tells the Main Admin to change the
   role in the Admin panel instead — and still marks the request decided,
   per the package spec (see notes.md). */
async function pp_renderRoleRequests() {
  var box = pp_el("pp_roleReqList");
  if (!box || !pp_P.isMainAdmin()) return;
  var res = await pp_P.client.from("role_requests").select("*").order("created_at", { ascending: false }).limit(50);
  if (res.error) { box.innerHTML = '<p class="empty">Could not load requests: ' + pp_esc(res.error.message) + "</p>"; return; }
  if (!res.data || !res.data.length) { box.innerHTML = '<p class="empty">No role-change requests yet.</p>'; return; }
  box.innerHTML = res.data.map(function (r) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(pp_memberName(r.member_id)) + "</b> " +
      '<span class="chip' + (r.status === "pending" ? " orange" : " ghost") + '">' + pp_esc(r.status || "pending") + "</span>" +
      '<div class="meta">Wants: ' + pp_esc(pp_P.roleLabel(r.requested_role)) + " &middot; " + pp_esc(pp_P.timeAgo(r.created_at)) + "</div>" +
      (r.reason ? "<p>" + pp_esc(r.reason) + "</p>" : "") + "</div>" +
      (r.status === "pending" ? '<div class="actions">' +
        '<button class="btn small" type="button" data-pp-req-approve="' + pp_esc(r.id) + '" data-pp-member="' + pp_esc(r.member_id) + '" data-pp-role="' + pp_esc(r.requested_role) + '">Approve</button>' +
        '<button class="btn ghost small" type="button" data-pp-req-decline="' + pp_esc(r.id) + '">Decline</button>' +
        "</div>" : "") +
      "</div>";
  }).join("");
}
async function pp_renderMyRoleRequests() {
  var box = pp_el("pp_myRoleReqList");
  if (!box) return;
  var res = await pp_P.client.from("role_requests").select("*").eq("member_id", pp_P.me.id).order("created_at", { ascending: false }).limit(10);
  if (res.error || !res.data || !res.data.length) {
    box.innerHTML = res.error ? "" : '<p class="empty">You have no role-change requests yet.</p>';
    return;
  }
  box.innerHTML = "<h2 class=\"sec\">My <span class=\"serif-i\">requests</span></h2>" + res.data.map(function (r) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(pp_P.roleLabel(r.requested_role)) + "</b> " +
      '<span class="chip' + (r.status === "pending" ? " orange" : " ghost") + '">' + pp_esc(r.status || "pending") + "</span>" +
      '<div class="meta">' + pp_esc(pp_P.timeAgo(r.created_at)) + "</div>" +
      (r.reason ? "<p>" + pp_esc(r.reason) + "</p>" : "") + "</div></div>";
  }).join("");
}

/* ---------------- external contacts (#59) ---------------- */
async function pp_renderExternalContacts() {
  var res = await pp_P.client.from("external_contacts").select("*").order("category", { ascending: true }).order("name", { ascending: true });
  var html;
  if (res.error) html = '<p class="empty">Could not load contacts: ' + pp_esc(res.error.message) + "</p>";
  else if (!res.data || !res.data.length) html = '<p class="empty">No external contacts yet.</p>';
  else html = res.data.map(function (c) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(c.name) + "</b> " +
      '<span class="chip ghost">' + pp_esc(c.category || "other") + "</span>" +
      '<div class="meta">' + pp_esc(c.contact || "") + "</div>" +
      (c.note ? "<p>" + pp_esc(c.note) + "</p>" : "") + "</div>" +
      (pp_P.isMainAdmin() ? '<div class="actions"><button class="btn ghost small" type="button" data-pp-ext-del="' + pp_esc(c.id) + '">Remove</button></div>' : "") +
      "</div>";
  }).join("");
  if (pp_el("pp_extList")) pp_el("pp_extList").innerHTML = html;
  if (pp_el("pp_extClubList")) pp_el("pp_extClubList").innerHTML = html;
}

/* ---------------- my show history (#61, Settings) ---------------- */
async function pp_renderMyShows() {
  var box = pp_el("pp_myShowsList");
  if (!box) return;
  var res = await pp_P.client.from("show_history").select("*").eq("member_id", pp_P.me.id).order("show_date", { ascending: false });
  if (res.error) { box.innerHTML = '<p class="empty">Could not load your shows.</p>'; return; }
  if (!res.data || !res.data.length) { box.innerHTML = '<p class="empty">No shows recorded yet — the Main Admin adds them after each show.</p>'; return; }
  box.innerHTML = res.data.map(function (s) {
    return '<div class="row-item"><div class="body"><b>' + pp_esc(s.show_name) + "</b>" +
      '<div class="meta">' + (s.show_date ? pp_esc(String(s.show_date).slice(0, 10)) : "") + (s.role_text ? " &middot; " + pp_esc(s.role_text) : "") + "</div></div></div>";
  }).join("");
}

/* ---------------- recycle bin (#70) ---------------- */
/* Deleted members: list_members_full excludes deleted rows, so we query
   profiles directly. If RLS blocks that select, the card shows an honest
   empty state with the reason instead of fake rows (see notes.md). */
async function pp_renderRecycleBin() {
  var msgBox = pp_el("pp_recycleMsgList");
  var memBox = pp_el("pp_recycleMemberList");
  if (!msgBox && !memBox) return;
  var res = await pp_P.client.from("messages").select("id,sender_id,recipient_id,kind,subject,body,deleted_at")
    .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50);
  if (res.error) {
    if (msgBox) msgBox.innerHTML = '<p class="empty">Could not load deleted messages: ' + pp_esc(res.error.message) + "</p>";
  } else if (!res.data || !res.data.length) {
    if (msgBox) msgBox.innerHTML = '<p class="empty">No deleted messages.</p>';
  } else if (msgBox) {
    msgBox.innerHTML = res.data.map(function (m) { return pp_recycleRowHtml(m, "msg"); }).join("");
  }
  var pres = await pp_P.client.from("profiles").select("id,name,login_id,role,deleted_at")
    .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50);
  if (pres.error) {
    if (memBox) memBox.innerHTML = '<p class="empty">Could not load deleted members: ' + pp_esc(pres.error.message) + ". The database may not let this role read soft-deleted profiles — if so, restoring a deleted member needs the Main Admin to run the restore from the database.</p>";
  } else if (!pres.data || !pres.data.length) {
    if (memBox) memBox.innerHTML = '<p class="empty">No deleted members.</p>';
  } else if (memBox) {
    memBox.innerHTML = pres.data.map(function (m) { return pp_recycleRowHtml(m, "member"); }).join("");
  }
}
function pp_recycleRowHtml(r, kind) {
  var days = pp_daysAgo(r.deleted_at);
  var expired = days != null && days > 7;
  var label = kind === "member"
    ? pp_esc(r.name) + " (" + pp_esc(pp_P.roleLabel(r.role)) + ")"
    : (r.kind === "announcement" ? "Announcement" : "Message") + " — " + pp_esc((r.subject || r.body || "").slice(0, 80));
  return '<div class="row-item"><div class="body"><b>' + label + "</b>" +
    '<div class="meta">Deleted ' + pp_esc(pp_P.timeAgo(r.deleted_at)) + (expired ? " &middot; <b>Restore window expired (over 7 days)</b>" : " &middot; restore within 7 days") + "</div></div>" +
    '<div class="actions"><button class="btn ghost small" type="button" data-pp-rb-restore="' + pp_esc(r.id) + '" data-pp-rb-kind="' + kind + '"' + (expired ? " disabled" : "") + ">Restore</button></div></div>";
}
function pp_fillRecyclePickers() {
  var mSel = pp_el("pp_rbMemberSel");
  if (mSel) {
    var members = (pp_P.adminRows || []).filter(function (r) { return !r.deleted_at && r.role !== "admin"; });
    mSel.innerHTML = '<option value="">Choose a member…</option>' + members.map(function (r) {
      return '<option value="' + pp_esc(r.id) + '">' + pp_esc(r.name) + " — " + pp_esc(pp_P.roleLabel(r.role)) + "</option>";
    }).join("");
  }
  var aSel = pp_el("pp_rbAnnSel");
  if (aSel) {
    var anns = pp_P.annRows || [];
    aSel.innerHTML = '<option value="">Choose an announcement…</option>' + anns.map(function (a) {
      return '<option value="' + pp_esc(a.id) + '">' + pp_esc((a.body || "").slice(0, 80)) + "</option>";
    }).join("");
  }
}

/* ---------------- profile completion meter (#84) ---------------- */
async function pp_renderCompletion() {
  var bar = pp_el("pp_completeBar");
  var text = pp_el("pp_completeText");
  var list = pp_el("pp_completeList");
  if (!bar || !list) return;
  var me = pp_P.me;
  var meas = await pp_loadMyMeasurements();
  var items = [
    { done: !!me.avatar_url, label: "Profile photo", target: "myPhotoFile", link: "Upload a photo" },
    { done: !!me.mobile, label: "Mobile number", target: "myMobileInput", link: "Add your mobile" },
    { done: !!(meas && meas.height_cm != null && meas.chest_cm != null && meas.waist_cm != null && meas.hip_cm != null && meas.shoe_size), label: "Measurements (height, chest, waist, hip, shoe size)", target: "pp_measHeight", link: "Fill in measurements" }
  ];
  var doneCount = items.filter(function (x) { return x.done; }).length;
  var pct = Math.round(doneCount / items.length * 100);
  bar.style.width = pct + "%";
  if (text) text.textContent = doneCount === items.length
    ? "Your profile is complete — nice work."
    : "Your profile is " + pct + "% complete (" + doneCount + " of " + items.length + " done).";
  list.innerHTML = items.map(function (x) {
    return '<div class="row-item" style="margin-bottom:8px"><div class="body"><b>' + (x.done ? "✓ " : "○ ") + pp_esc(x.label) + "</b>" +
      (x.done ? "" : ' <button class="btn ghost small" type="button" data-pp-goto="' + pp_esc(x.target) + '">' + pp_esc(x.link) + "</button>") +
      "</div></div>";
  }).join("");
}

/* ---------------- download my own data (#65) ---------------- */
async function pp_downloadMyData() {
  var prof = await pp_P.client.from("profiles").select("*").eq("id", pp_P.me.id).single();
  var msgs = await pp_P.client.from("messages").select("id,sender_id,recipient_id,kind,subject,body,created_at")
    .or("sender_id.eq." + pp_P.me.id + ",recipient_id.eq." + pp_P.me.id)
    .order("created_at", { ascending: false }).limit(500);
  var data = {
    exported_at: new Date().toISOString(),
    profile: (!prof.error && prof.data) ? prof.data : null,
    messages: (!msgs.error && msgs.data) ? msgs.data : []
  };
  pp_P.downloadFile("reva-fashion-club-my-data-" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(data, null, 2), "application/json");
  pp_msg(pp_el("pp_myDataMsg"), "Your data has been downloaded (" + data.messages.length + " message" + (data.messages.length === 1 ? "" : "s") + " included).", "ok");
}

/* ---------------- delegated clicks (one listener for the whole package) ---------------- */
function pp_onClick(e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;
  var btn = t.closest ? t.closest("[data-pp-copy-email],[data-pp-copy-mobile],[data-pp-idcard],[data-pp-alumni],[data-pp-probation-save],[data-pp-probation-clear],[data-pp-em-save],[data-pp-meas-save],[data-pp-hist-add],[data-pp-app-note-save],[data-pp-app-aud-save],[data-pp-cost-assign],[data-pp-cost-return],[data-pp-trophy-del],[data-pp-guest-status],[data-pp-ext-del],[data-pp-req-approve],[data-pp-req-decline],[data-pp-rb-restore],[data-pp-goto]") : null;
  if (!btn) return;
  var id, res, msgEl;
  if (btn.hasAttribute("data-pp-copy-email") || btn.hasAttribute("data-pp-copy-mobile")) {
    id = btn.getAttribute("data-pp-copy-email") || btn.getAttribute("data-pp-copy-mobile");
    var wantEmail = btn.hasAttribute("data-pp-copy-email");
    btn.disabled = true;
    pp_P.client.rpc("get_member_contact", { p_id: id }).then(function (r) {
      btn.disabled = false;
      if (r.error || !r.data || !r.data[0]) { alert("Could not load contact details."); return; }
      var val = wantEmail ? r.data[0].email : r.data[0].mobile;
      if (!val) { alert(wantEmail ? "No email on this account." : "No mobile on this account."); return; }
      pp_copyText(val, btn);
    });
    return;
  }
  if (btn.hasAttribute("data-pp-idcard")) { pp_openIdCard(btn.getAttribute("data-pp-idcard")); return; }
  if (btn.hasAttribute("data-pp-goto")) {
    var target = pp_el(btn.getAttribute("data-pp-goto"));
    if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.focus(); }
    return;
  }
  if (btn.hasAttribute("data-pp-alumni")) {
    id = btn.getAttribute("data-pp-alumni");
    var on = btn.getAttribute("data-pp-on") === "1";
    if (!window.confirm(on ? "Mark this member as alumni? They keep read-only access." : "Remove alumni status for this member?")) return;
    pp_P.client.from("profiles").update({ is_alumni: on }).eq("id", id).then(function (r) {
      if (r.error) { alert("Could not update: " + r.error.message); return; }
      var modal = pp_el("profileModal");
      if (modal && !modal.hidden) modal.hidden = true;
      pp_P.refreshAdminList().then(function () { pp_renderAlumni(); pp_enhanceAdminList(); });
    });
    return;
  }
  if (btn.hasAttribute("data-pp-probation-save")) {
    id = btn.getAttribute("data-pp-probation-save");
    var reason = pp_el("pp_probReason") ? pp_el("pp_probReason").value.trim() : "";
    var until = pp_el("pp_probUntil") ? pp_el("pp_probUntil").value : "";
    if (!reason && !until) { if (pp_el("pp_pfProbMsg")) pp_el("pp_pfProbMsg").textContent = "Give a reason or an end date."; return; }
    pp_P.client.from("profiles").update({ probation_reason: reason || null, probation_until: until || null }).eq("id", id).then(function (r) {
      if (r.error) { if (pp_el("pp_pfProbMsg")) pp_el("pp_pfProbMsg").textContent = r.error.message; return; }
      if (pp_el("pp_pfProbMsg")) pp_el("pp_pfProbMsg").textContent = "Probation saved.";
      pp_P.refreshAdminList().then(pp_enhanceAdminList);
    });
    return;
  }
  if (btn.hasAttribute("data-pp-probation-clear")) {
    id = btn.getAttribute("data-pp-probation-clear");
    pp_P.client.from("profiles").update({ probation_reason: null, probation_until: null }).eq("id", id).then(function (r) {
      if (r.error) { if (pp_el("pp_pfProbMsg")) pp_el("pp_pfProbMsg").textContent = r.error.message; return; }
      if (pp_el("pp_pfProbMsg")) pp_el("pp_pfProbMsg").textContent = "Probation cleared.";
      pp_P.refreshAdminList().then(pp_enhanceAdminList);
    });
    return;
  }
  if (btn.hasAttribute("data-pp-em-save")) {
    id = btn.getAttribute("data-pp-em-save");
    var em = {
      emergency_name: pp_el("pp_pfEmName") ? pp_el("pp_pfEmName").value.trim() || null : null,
      emergency_phone: pp_el("pp_pfEmPhone") ? pp_el("pp_pfEmPhone").value.trim() || null : null,
      emergency_relation: pp_el("pp_pfEmRel") ? pp_el("pp_pfEmRel").value.trim() || null : null
    };
    pp_P.client.from("profiles").update(em).eq("id", id).then(function (r) {
      if (r.error) { if (pp_el("pp_pfEmMsg")) pp_el("pp_pfEmMsg").textContent = r.error.message; return; }
      if (pp_el("pp_pfEmMsg")) pp_el("pp_pfEmMsg").textContent = "Emergency contact saved.";
    });
    return;
  }
  if (btn.hasAttribute("data-pp-meas-save")) {
    id = btn.getAttribute("data-pp-meas-save");
    pp_saveMeasurements(id, "pp_pfMeas", pp_el("pp_pfMeasMsg")).then(function () { pp_renderCompletion(); });
    return;
  }
  if (btn.hasAttribute("data-pp-hist-add")) {
    id = btn.getAttribute("data-pp-hist-add");
    var name = pp_el("pp_histName") ? pp_el("pp_histName").value.trim() : "";
    var date = pp_el("pp_histDate") ? pp_el("pp_histDate").value : "";
    var role = pp_el("pp_histRole") ? pp_el("pp_histRole").value.trim() : "";
    if (!name) { if (pp_el("pp_pfHistMsg")) pp_el("pp_pfHistMsg").textContent = "Enter the show name."; return; }
    pp_P.client.from("show_history").insert({ member_id: id, show_name: name, show_date: date || null, role_text: role || null }).then(function (r) {
      if (r.error) { if (pp_el("pp_pfHistMsg")) pp_el("pp_pfHistMsg").textContent = r.error.message; return; }
      if (pp_el("pp_pfHistMsg")) pp_el("pp_pfHistMsg").textContent = "Show added.";
      pp_fillProfileExtra();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-app-note-save")) {
    id = btn.getAttribute("data-pp-app-note-save");
    var ta = pp_el("pp_note_" + id);
    msgEl = pp_el("pp_appmsg_" + id);
    pp_P.client.from("applications").update({ interview_note: ta ? ta.value.trim() || null : null }).eq("id", id).then(function (r) {
      if (msgEl) msgEl.textContent = r.error ? "Could not save: " + r.error.message : "Note saved.";
    });
    return;
  }
  if (btn.hasAttribute("data-pp-app-aud-save")) {
    id = btn.getAttribute("data-pp-app-aud-save");
    var dt = pp_el("pp_aud_" + id);
    msgEl = pp_el("pp_appmsg_" + id);
    if (!dt || !dt.value) { if (msgEl) msgEl.textContent = "Pick an audition date first."; return; }
    pp_P.client.from("applications").update({ audition_date: dt.value, status: "shortlisted" }).eq("id", id).then(function (r) {
      if (r.error) { if (msgEl) msgEl.textContent = "Could not save: " + r.error.message; return; }
      if (msgEl) msgEl.textContent = "Shortlisted for audition on " + dt.value + ".";
      pp_P.refreshApplicants().then(pp_enhanceApplicants);
    });
    return;
  }
  if (btn.hasAttribute("data-pp-cost-assign")) {
    id = btn.getAttribute("data-pp-cost-assign");
    var selEl = document.querySelector('[data-pp-cost-assign-sel="' + id + '"]');
    var memberId = selEl ? selEl.value : "";
    if (!memberId) { pp_msg(pp_el("pp_costumeMsg"), "Pick a member to assign this costume to."); return; }
    pp_P.client.from("costumes").update({ assigned_to: memberId, status: "assigned" }).eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_costumeMsg"), "Could not assign: " + r.error.message); return; }
      pp_msg(pp_el("pp_costumeMsg"), "Costume assigned to " + pp_memberName(memberId) + ".", "ok");
      pp_renderCostumes();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-cost-return")) {
    id = btn.getAttribute("data-pp-cost-return");
    pp_P.client.from("costumes").update({ assigned_to: null, status: "returned" }).eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_costumeMsg"), "Could not mark returned: " + r.error.message); return; }
      pp_msg(pp_el("pp_costumeMsg"), "Costume marked returned.", "ok");
      pp_renderCostumes();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-trophy-del")) {
    id = btn.getAttribute("data-pp-trophy-del");
    if (!window.confirm("Remove this trophy from the wall?")) return;
    pp_P.client.from("trophy_wall").delete().eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_trophyMsg"), "Could not remove: " + r.error.message); return; }
      pp_renderTrophies();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-guest-status")) {
    id = btn.getAttribute("data-pp-guest-status");
    var st = btn.getAttribute("data-pp-status");
    pp_P.client.from("guests").update({ status: st }).eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_guestMsg"), "Could not update: " + r.error.message); return; }
      pp_renderGuests();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-ext-del")) {
    id = btn.getAttribute("data-pp-ext-del");
    if (!window.confirm("Remove this contact?")) return;
    pp_P.client.from("external_contacts").delete().eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_extMsg"), "Could not remove: " + r.error.message); return; }
      pp_renderExternalContacts();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-req-approve")) {
    id = btn.getAttribute("data-pp-req-approve");
    var memberId2 = btn.getAttribute("data-pp-member");
    var newRole = btn.getAttribute("data-pp-role");
    pp_P.client.from("profiles").update({ role: newRole }).eq("id", memberId2).then(function (r) {
      if (r.error) {
        /* Fallback (see notes.md): the request is still marked decided,
           but the Main Admin is told the role itself still needs changing
           in the Admin panel. */
        pp_msg(pp_el("pp_roleReqMsg"), "The role could not be changed directly (" + r.error.message + "). Change " + pp_memberName(memberId2) + "’s role to " + pp_P.roleLabel(newRole) + " in the Admin panel — the request itself is now marked decided.", "err");
      }
      pp_P.client.from("role_requests").update({ status: "approved", decided_by: pp_P.me.id }).eq("id", id).then(function () {
        pp_renderRoleRequests();
        pp_P.refreshAdminList();
      });
    });
    return;
  }
  if (btn.hasAttribute("data-pp-req-decline")) {
    id = btn.getAttribute("data-pp-req-decline");
    pp_P.client.from("role_requests").update({ status: "declined", decided_by: pp_P.me.id }).eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_roleReqMsg"), "Could not decline: " + r.error.message); return; }
      pp_renderRoleRequests();
    });
    return;
  }
  if (btn.hasAttribute("data-pp-rb-restore")) {
    id = btn.getAttribute("data-pp-rb-restore");
    var kind = btn.getAttribute("data-pp-rb-kind");
    var table = kind === "member" ? "profiles" : "messages";
    pp_P.client.from(table).update({ deleted_at: null }).eq("id", id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_recycleMsg"), "Could not restore: " + r.error.message); return; }
      pp_msg(pp_el("pp_recycleMsg"), kind === "member" ? "Member restored." : "Message restored.", "ok");
      pp_renderRecycleBin();
      if (kind === "member") pp_P.refreshAdminList();
      if (kind === "msg") { pp_P.refreshDashboard(); pp_P.refreshAnnouncements(); }
    });
    return;
  }
}

/* ---------------- init (called by the coordinator from __f91Init) ---------------- */
function f91InitPeople(P) {
  pp_P = P;
  if (!P.me) return;

  /* Gate every card by role. Admin-tab cards are Main Admin only;
     the Club-tab external-contacts card is officials/admins only;
     Settings cards are for everyone. */
  var isMA = P.isMainAdmin();
  var show = function (id, visible) { var el = pp_el(id); if (el) el.hidden = !visible; };
  show("pp_alumniCard", isMA);
  show("pp_yearCard", isMA);
  show("pp_costumeCard", isMA);
  show("pp_trophyCard", isMA);
  show("pp_guestCard", isMA);
  show("pp_constCard", isMA);
  show("pp_roleReqCard", isMA);
  show("pp_bulkRoleCard", isMA);
  show("pp_recycleCard", isMA);
  show("pp_extCard", isMA);
  show("pp_extClubCard", P.isOfficialOrAbove());

  /* One delegated click listener for the whole package (the profile
     modal HTML is re-created on every open, so its buttons cannot be
     wired once). */
  if (!pp_wired) {
    document.addEventListener("click", pp_onClick);
    pp_wired = true;
  }

  /* Applicants + Admin list enhancements run after portal.js renders
     them, via MutationObserver. Both enhancers are idempotent. */
  if (window.MutationObserver) {
    var appList = pp_el("applicantList");
    if (appList) {
      new MutationObserver(function () { if (!pp_obsBusy) { pp_obsBusy = true; try { pp_enhanceApplicants(); } finally { pp_obsBusy = false; } } }).observe(appList, { childList: true, subtree: true });
    }
    var admList = pp_el("adminList");
    if (admList) {
      new MutationObserver(function () { if (!pp_obsBusy) { pp_obsBusy = true; try { pp_enhanceAdminList(); } finally { pp_obsBusy = false; } } }).observe(admList, { childList: true, subtree: true });
    }
  }
  pp_enhanceApplicants();
  pp_enhanceAdminList();

  /* Trophy wall (dashboard, everyone) + constitution read-only view. */
  pp_renderTrophies();
  pp_loadConstitution();

  /* Settings: own measurements, costume, shows, emergency contact,
     role requests, completion meter, data export, ID card. */
  if (pp_el("pp_myRoleNow")) pp_el("pp_myRoleNow").textContent = P.roleLabel(P.me.role);
  if (pp_el("pp_myRoleReqRole")) pp_el("pp_myRoleReqRole").innerHTML = pp_roleOptions("core_member");
  if (pp_el("pp_bulkRoleSel")) pp_el("pp_bulkRoleSel").innerHTML = pp_roleOptions("member");
  if (pp_el("pp_emName")) {
    pp_el("pp_emName").value = P.me.emergency_name || "";
    pp_el("pp_emPhone").value = P.me.emergency_phone || "";
    pp_el("pp_emRelation").value = P.me.emergency_relation || "";
  }
  pp_loadMyMeasurements();
  pp_renderMyCostume();
  pp_renderMyShows();
  pp_renderMyRoleRequests();
  pp_renderCompletion();

  if (P.isOfficialOrAbove()) pp_renderExternalContacts();

  if (isMA) {
    pp_loadClubYear();
    pp_renderCostumes();
    pp_loadGuestEvents();
    pp_renderRoleRequests();
    pp_renderRecycleBin();
    pp_renderAlumni();
    pp_fillRecyclePickers();
    /* Bulk-role member checklist (own selection — portal.js's
       bulkSelected is internal and cannot be read). */
    var brl = pp_el("pp_bulkRoleList");
    if (brl) {
      var members = (P.adminRows || []).filter(function (r) { return r.role !== "admin"; });
      brl.innerHTML = members.length ? members.map(function (r) {
        return '<label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-family:inherit;font-size:14.5px;font-weight:400;color:var(--ink-80);margin-bottom:6px">' +
          '<input type="checkbox" data-pp-bulk-role="' + pp_esc(r.id) + '" style="width:auto;margin:0" /> ' +
          pp_esc(r.name) + " — " + pp_esc(P.roleLabel(r.role)) + "</label>";
      }).join("") : '<p class="empty">No members to edit.</p>';
    }
  }

  /* ---- static button wiring (guarded: a missing fragment is skipped) ---- */
  var on = function (id, fn) { var el = pp_el(id); if (el) el.addEventListener("click", fn); };

  on("pp_clubYearSaveBtn", function () {
    var y = parseInt(pp_el("pp_clubYearInput").value, 10);
    if (!y || y < 2020 || y > 2100) { pp_msg(pp_el("pp_yearMsg"), "Enter a valid club year, e.g. 2026."); return; }
    P.client.rpc("set_club_year", { p_value: y }).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_yearMsg"), "Could not set the club year: " + r.error.message); return; }
      pp_clubYear = y;
      if (pp_el("pp_clubYearNow")) pp_el("pp_clubYearNow").textContent = String(y);
      pp_msg(pp_el("pp_yearMsg"), "Club year set to " + y + ".", "ok");
      pp_enhanceAdminList();
    });
  });
  on("pp_bulkRenewBtn", pp_bulkRenew);

  on("pp_costAddBtn", function () {
    var name = pp_el("pp_costName").value.trim();
    if (!name) { pp_msg(pp_el("pp_costumeMsg"), "Enter a costume name."); return; }
    P.client.from("costumes").insert({
      name: name, description: pp_el("pp_costDesc").value.trim() || null,
      size: pp_el("pp_costSize").value.trim() || null, note: pp_el("pp_costNote").value.trim() || null,
      status: "available"
    }).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_costumeMsg"), "Could not add: " + r.error.message); return; }
      pp_el("pp_costName").value = ""; pp_el("pp_costDesc").value = ""; pp_el("pp_costSize").value = ""; pp_el("pp_costNote").value = "";
      pp_msg(pp_el("pp_costumeMsg"), "Costume added.", "ok");
      pp_renderCostumes();
    });
  });

  on("pp_trophyAddBtn", async function () {
    var title = pp_el("pp_trophyTitle").value.trim();
    var year = parseInt(pp_el("pp_trophyYear").value, 10);
    if (!title) { pp_msg(pp_el("pp_trophyMsg"), "Enter a title."); return; }
    if (!year) { pp_msg(pp_el("pp_trophyMsg"), "Enter the year."); return; }
    var photoUrl = null;
    var file = pp_el("pp_trophyPhoto").files && pp_el("pp_trophyPhoto").files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { pp_msg(pp_el("pp_trophyMsg"), "Photo must be under 5 MB."); return; }
      var path = "trophies/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var up = await P.client.storage.from("club-files").upload(path, file);
      if (up.error) { pp_msg(pp_el("pp_trophyMsg"), "Could not upload the photo: " + up.error.message); return; }
      photoUrl = P.client.storage.from("club-files").getPublicUrl(path).data.publicUrl;
    }
    var res = await P.client.from("trophy_wall").insert({
      title: title, event_name: pp_el("pp_trophyEvent").value.trim() || null,
      year: year, photo_url: photoUrl, note: pp_el("pp_trophyNote").value.trim() || null
    });
    if (res.error) { pp_msg(pp_el("pp_trophyMsg"), "Could not add: " + res.error.message); return; }
    pp_el("pp_trophyTitle").value = ""; pp_el("pp_trophyYear").value = "";
    pp_el("pp_trophyEvent").value = ""; pp_el("pp_trophyNote").value = ""; pp_el("pp_trophyPhoto").value = "";
    pp_msg(pp_el("pp_trophyMsg"), "Added to the trophy wall.", "ok");
    pp_renderTrophies();
  });

  on("pp_guestAddBtn", function () {
    var eventId = pp_el("pp_guestEventSel").value;
    var name = pp_el("pp_guestName").value.trim();
    if (!eventId) { pp_msg(pp_el("pp_guestMsg"), "Pick an event first."); return; }
    if (!name) { pp_msg(pp_el("pp_guestMsg"), "Enter the guest's name."); return; }
    P.client.from("guests").insert({
      event_id: eventId, name: name, kind: pp_el("pp_guestKind").value,
      contact: pp_el("pp_guestContact").value.trim() || null, status: "pending"
    }).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_guestMsg"), "Could not invite: " + r.error.message); return; }
      pp_el("pp_guestName").value = ""; pp_el("pp_guestContact").value = "";
      pp_msg(pp_el("pp_guestMsg"), "Guest invited (pending).", "ok");
      pp_renderGuests();
    });
  });
  var guestSel = pp_el("pp_guestEventSel");
  if (guestSel) guestSel.addEventListener("change", pp_renderGuests);

  on("pp_constSaveBtn", function () {
    var text = pp_el("pp_constText").value;
    P.client.rpc("set_constitution", { p_value: text }).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_constMsg"), "Could not save: " + r.error.message); return; }
      pp_msg(pp_el("pp_constMsg"), "Constitution saved.", "ok");
      pp_loadConstitution();
    });
  });

  on("pp_extAddBtn", function () {
    var name = pp_el("pp_extName").value.trim();
    if (!name) { pp_msg(pp_el("pp_extMsg"), "Enter a name."); return; }
    P.client.from("external_contacts").insert({
      name: name, category: pp_el("pp_extCat").value,
      contact: pp_el("pp_extContact").value.trim() || null, note: pp_el("pp_extNote").value.trim() || null
    }).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_extMsg"), "Could not add: " + r.error.message); return; }
      pp_el("pp_extName").value = ""; pp_el("pp_extContact").value = ""; pp_el("pp_extNote").value = "";
      pp_msg(pp_el("pp_extMsg"), "Contact added.", "ok");
      pp_renderExternalContacts();
    });
  });

  on("pp_bulkRoleApplyBtn", function () {
    var boxes = document.querySelectorAll("[data-pp-bulk-role]:checked");
    var role = pp_el("pp_bulkRoleSel").value;
    if (!boxes.length) { pp_msg(pp_el("pp_bulkRoleMsg"), "Tick at least one member."); return; }
    if (!window.confirm("Change the role of " + boxes.length + " member" + (boxes.length === 1 ? "" : "s") + " to " + P.roleLabel(role) + "?")) return;
    var ids = [];
    for (var i = 0; i < boxes.length; i++) ids.push(boxes[i].getAttribute("data-pp-bulk-role"));
    var done = 0, failed = 0, failures = [];
    var step = function (idx) {
      if (idx >= ids.length) {
        pp_msg(pp_el("pp_bulkRoleMsg"),
          "Role changed for " + done + " member" + (done === 1 ? "" : "s") +
          (failed ? ". " + failed + " failed (" + failures.join("; ") + ") — change those in the Admin panel." : "."),
          failed ? "err" : "ok");
        P.refreshAdminList().then(pp_enhanceAdminList);
        return;
      }
      P.client.from("profiles").update({ role: role }).eq("id", ids[idx]).then(function (r) {
        if (r.error) { failed++; failures.push(pp_memberName(ids[idx]) + ": " + r.error.message); }
        else done++;
        step(idx + 1);
      });
    };
    step(0);
  });

  on("pp_rbMemberBtn", function () {
    var memberId = pp_el("pp_rbMemberSel").value;
    if (!memberId) { pp_msg(pp_el("pp_recycleMsg"), "Choose a member first."); return; }
    if (!window.confirm("Move " + pp_memberName(memberId) + " to the recycle bin? They will be soft-deleted and can be restored within 7 days.")) return;
    P.client.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", memberId).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_recycleMsg"), "Could not move to the recycle bin: " + r.error.message); return; }
      pp_msg(pp_el("pp_recycleMsg"), "Member moved to the recycle bin.", "ok");
      pp_renderRecycleBin();
      P.refreshAdminList().then(pp_enhanceAdminList);
    });
  });
  on("pp_rbAnnBtn", function () {
    var annId = pp_el("pp_rbAnnSel").value;
    if (!annId) { pp_msg(pp_el("pp_recycleMsg"), "Choose an announcement first."); return; }
    if (!window.confirm("Move this announcement to the recycle bin? It can be restored within 7 days.")) return;
    P.client.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", annId).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_recycleMsg"), "Could not move to the recycle bin: " + r.error.message); return; }
      pp_msg(pp_el("pp_recycleMsg"), "Announcement moved to the recycle bin.", "ok");
      pp_renderRecycleBin();
      P.refreshDashboard(); P.refreshAnnouncements();
    });
  });
  on("pp_rbRefreshBtn", pp_renderRecycleBin);

  /* Settings cards. */
  on("pp_measSaveBtn", function () {
    pp_saveMeasurements(P.me.id, "pp_meas", pp_el("pp_measMsg")).then(function (ok) { if (ok) pp_renderCompletion(); });
  });
  on("pp_emSaveBtn", function () {
    var vals = {
      emergency_name: pp_el("pp_emName").value.trim() || null,
      emergency_phone: pp_el("pp_emPhone").value.trim() || null,
      emergency_relation: pp_el("pp_emRelation").value.trim() || null
    };
    P.client.from("profiles").update(vals).eq("id", P.me.id).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_emMsg"), "Could not save: " + r.error.message); return; }
      P.me.emergency_name = vals.emergency_name;
      P.me.emergency_phone = vals.emergency_phone;
      P.me.emergency_relation = vals.emergency_relation;
      pp_msg(pp_el("pp_emMsg"), "Emergency contact saved.", "ok");
    });
  });
  on("pp_myRoleReqBtn", function () {
    var role = pp_el("pp_myRoleReqRole").value;
    var reason = pp_el("pp_myRoleReqReason").value.trim();
    if (!reason) { pp_msg(pp_el("pp_myRoleReqMsg"), "Say why you would like this role."); return; }
    P.client.from("role_requests").insert({ member_id: P.me.id, requested_role: role, reason: reason, status: "pending" }).then(function (r) {
      if (r.error) { pp_msg(pp_el("pp_myRoleReqMsg"), "Could not send: " + r.error.message); return; }
      pp_el("pp_myRoleReqReason").value = "";
      pp_msg(pp_el("pp_myRoleReqMsg"), "Request sent to the Main Admin.", "ok");
      pp_renderMyRoleRequests();
    });
  });
  on("pp_myDataBtn", pp_downloadMyData);
  on("pp_idCardBtn", function () { pp_openIdCard(P.me.id); });
}



/* ================= shell/shell.js ================= */

/* SHELL package — Step 16 (91 features) — portal cross-cutting UI.
   Loaded after portal.js; the coordinator calls f91InitShell(P) from the
   master window.__f91Init with P = window.Portal91. Plain ES5, matching
   portal.js style. Every top-level name inside is prefixed sh_.
   Features: #16 gallery, #23 theme toggle (portal side), #34 gallery mgmt
   (Second Admin), #44 notification bell, #63 global search, #66 quick
   actions, #69/#76 announcement preview, #86 call/WhatsApp links,
   #87 copy Join link, #88 font size, #89 reduce motion, #90 what's new. */

function f91InitShell(P) {
  var sh_JOIN_URL = "https://mvarunsptspt.github.io/reva-fashion-club/#join";
  var sh_VERSION = "16.0";
  var sh_bellTimer = null;
  var sh_searchTimer = null;
  var sh_galleryLoaded = false;

  /* ---------- small helpers ---------- */
  function sh_el(id) { return document.getElementById(id); }
  function sh_on(id, ev, fn) {
    var el = sh_el(id);
    if (el) el.addEventListener(ev, fn);
    return el;
  }
  function sh_digits(num) { return String(num || "").replace(/\D/g, ""); }
  function sh_waNumber(num) {
    var d = sh_digits(num);
    if (d.length === 10) return "91" + d;
    if (d.length === 11 && d.charAt(0) === "0") return "91" + d.slice(1);
    if (d.length === 12 && d.slice(0, 2) === "91") return d;
    return d;
  }

  /* ---------- last_seen_at heartbeat (engage package's who's-online) ---------- */
  try {
    P.client.rpc("touch_last_seen").then(function () {}, function () {});
  } catch (e) { /* fire-and-forget; never blocks boot */ }

  /* ================= #23 THEME TOGGLE (portal side) ================= */
  function sh_themeStored() {
    try { return window.localStorage.getItem("rfc-theme"); } catch (e) { return null; }
  }
  /* Rule (corrected spec): stored 'light'/'dark' wins; otherwise ALWAYS dark.
     The system preference is NOT followed — dark stays the default and the
     toggle is the only way to get light. */
  function sh_themeEffective() {
    var s = sh_themeStored();
    if (s === "dark" || s === "light") return s;
    return "dark";
  }
  function sh_applyTheme() {
    var t = sh_themeEffective();
    document.documentElement.setAttribute("data-theme", t);
    var btn = sh_el("sh_themeBtn");
    if (btn) btn.textContent = (t === "dark") ? "\u2600\uFE0F Light" : "\uD83C\uDF19 Dark";
  }
  sh_applyTheme();
  sh_on("sh_themeBtn", "click", function () {
    var next = (sh_themeEffective() === "dark") ? "light" : "dark";
    try { window.localStorage.setItem("rfc-theme", next); } catch (e) {}
    sh_applyTheme();
  });

  /* ================= #88 FONT SIZE ================= */
  function sh_applyFontSize() {
    var v = null;
    try { v = window.localStorage.getItem("rfc-fontsize"); } catch (e) {}
    if (v !== "large") v = "normal";
    document.documentElement.setAttribute("data-fontsize", v);
    var n = sh_el("sh_fontNormal"), l = sh_el("sh_fontLarge");
    if (n) n.setAttribute("aria-pressed", v === "normal" ? "true" : "false");
    if (l) l.setAttribute("aria-pressed", v === "large" ? "true" : "false");
  }
  sh_applyFontSize();
  sh_on("sh_fontNormal", "click", function () {
    try { window.localStorage.setItem("rfc-fontsize", "normal"); } catch (e) {}
    sh_applyFontSize();
  });
  sh_on("sh_fontLarge", "click", function () {
    try { window.localStorage.setItem("rfc-fontsize", "large"); } catch (e) {}
    sh_applyFontSize();
  });

  /* ================= #89 REDUCE MOTION ================= */
  function sh_applyMotion() {
    var v = null;
    try { v = window.localStorage.getItem("rfc-motion"); } catch (e) {}
    if (v !== "reduce" && v !== "full") {
      try { v = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "full"; } catch (e) { v = "full"; }
    }
    document.documentElement.setAttribute("data-motion", v);
    var cb = sh_el("sh_motionReduce");
    if (cb) cb.checked = (v === "reduce");
  }
  sh_applyMotion();
  sh_on("sh_motionReduce", "change", function () {
    var v = sh_el("sh_motionReduce").checked ? "reduce" : "full";
    try { window.localStorage.setItem("rfc-motion", v); } catch (e) {}
    sh_applyMotion();
  });

  /* ================= #44 NOTIFICATION BELL ================= */
  function sh_bellFetch() {
    if (!P.me || !P.me.id) return;
    P.client.from("notifications").select("id,title,body,link_tab,is_read,created_at")
      .eq("recipient_id", P.me.id).order("created_at", { ascending: false }).limit(20)
      .then(function (res) {
        if (res.error) return;
        sh_renderBell(res.data || []);
      }, function () {});
  }
  function sh_renderBell(rows) {
    var badge = sh_el("sh_bellBadge"), panel = sh_el("sh_bellList");
    var unread = 0, i, html = "";
    rows.forEach(function (r) { if (!r.is_read) unread++; });
    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = unread === 0;
    }
    if (!panel) return;
    if (!rows.length) {
      panel.innerHTML = '<p class="empty">No notifications yet.</p>';
      return;
    }
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<div class="sh-notif' + (r.is_read ? "" : " unread") + '" data-tab="' + P.esc(r.link_tab || "") + '" data-id="' + P.esc(r.id) + '">' +
        '<b>' + P.esc(r.title || "Notification") + '</b>' +
        (r.body ? '<p>' + P.esc(r.body) + '</p>' : "") +
        '<div class="meta">' + P.esc(P.timeAgo(r.created_at)) + '</div></div>';
    }
    panel.innerHTML = html;
    var items = panel.querySelectorAll(".sh-notif");
    for (i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function () {
        var tab = this.getAttribute("data-tab"), id = this.getAttribute("data-id");
        P.client.from("notifications").update({ is_read: true }).eq("id", id)
          .then(function () { sh_bellFetch(); }, function () {});
        sh_bellClose();
        if (tab) P.showTab(tab);
      });
    }
  }
  function sh_bellClose() {
    var p = sh_el("sh_bellPanel");
    if (p) p.hidden = true;
  }
  sh_on("sh_bellBtn", "click", function (ev) {
    ev.stopPropagation();
    var p = sh_el("sh_bellPanel");
    if (!p) return;
    p.hidden = !p.hidden;
    if (!p.hidden) sh_bellFetch();
  });
  sh_on("sh_bellMarkAll", "click", function () {
    if (!P.me || !P.me.id) return;
    P.client.from("notifications").update({ is_read: true })
      .eq("recipient_id", P.me.id).eq("is_read", false)
      .then(function () { sh_bellFetch(); }, function () {});
  });
  document.addEventListener("click", function (ev) {
    var p = sh_el("sh_bellPanel"), b = sh_el("sh_bellBtn");
    if (p && !p.hidden && b && !b.contains(ev.target) && !p.contains(ev.target)) sh_bellClose();
  });
  sh_bellFetch();
  sh_bellTimer = setInterval(sh_bellFetch, 60000);

  /* ================= #63 GLOBAL SEARCH ================= */
  function sh_searchClose() {
    var d = sh_el("sh_searchResults");
    if (d) d.hidden = true;
  }
  function sh_searchGroup(title, itemsHtml) {
    if (!itemsHtml) return "";
    return '<div class="sh-search-group"><div class="sh-search-head">' + P.esc(title) + '</div>' + itemsHtml + '</div>';
  }
  function sh_runSearch(q) {
    var box = sh_el("sh_searchResults");
    if (!box) return;
    q = (q || "").trim();
    if (q.length < 2) { sh_searchClose(); return; }
    var low = q.toLowerCase(), html = "", i, count;

    /* members (login ID searchable by Main Admin only) */
    var mHtml = "", mCount = 0;
    var dir = P.directory || [];
    for (i = 0; i < dir.length && mCount < 5; i++) {
      var m = dir[i];
      var nameHit = (m.name || "").toLowerCase().indexOf(low) !== -1;
      var idHit = P.isMainAdmin() && (m.login_id || "").toLowerCase().indexOf(low) !== -1;
      if (nameHit || idHit) {
        mHtml += '<div class="sh-search-item" data-act="member" data-id="' + P.esc(m.id) + '">' +
          P.avatarHtml(m) + '<span><b>' + P.esc(m.name || "—") + '</b><br /><span class="muted">' +
          P.esc(P.roleLabel(m.role)) + '</span></span></div>';
        mCount++;
      }
    }
    html += sh_searchGroup("Members", mHtml);

    /* announcements (already loaded in P.annRows) */
    var aHtml = "", aCount = 0;
    var anns = P.annRows || [];
    for (i = 0; i < anns.length && aCount < 5; i++) {
      var a = anns[i];
      if (((a.subject || "") + " " + (a.body || "")).toLowerCase().indexOf(low) !== -1) {
        aHtml += '<div class="sh-search-item" data-act="ann"><span><b>' +
          P.esc(a.subject || (a.body || "").slice(0, 60)) + '</b><br /><span class="muted">' +
          P.esc(P.timeAgo(a.created_at)) + '</span></span></div>';
        aCount++;
      }
    }
    html += sh_searchGroup("Announcements", aHtml);

    /* events + files: queried live (tables may be empty — then no results) */
    var evP = P.client.from("events").select("id,title,venue,starts_at")
      .order("starts_at", { ascending: false }).limit(20);
    var fP = P.client.from("files_library").select("id,name,url,category").limit(20);
    Promise.all([evP, fP]).then(function (results) {
      var eHtml = "", eCount = 0, fHtml = "", fCount = 0, j;
      var evs = (!results[0].error && results[0].data) ? results[0].data : [];
      for (j = 0; j < evs.length && eCount < 5; j++) {
        var ev = evs[j];
        if (((ev.title || "") + " " + (ev.venue || "")).toLowerCase().indexOf(low) !== -1) {
          eHtml += '<div class="sh-search-item" data-act="event"><span><b>' + P.esc(ev.title || "Event") + '</b><br /><span class="muted">' +
            P.esc(ev.venue || "") + (ev.starts_at ? " · " + P.esc(P.timeAgo(ev.starts_at)) : "") + '</span></span></div>';
          eCount++;
        }
      }
      var files = (!results[1].error && results[1].data) ? results[1].data : [];
      for (j = 0; j < files.length && fCount < 5; j++) {
        var f = files[j];
        if ((f.name || "").toLowerCase().indexOf(low) !== -1) {
          fHtml += '<div class="sh-search-item" data-act="file" data-url="' + P.esc(f.url || "") + '"><span><b>' +
            P.esc(f.name) + '</b><br /><span class="muted">' + P.esc(f.category || "File") + '</span></span></div>';
          fCount++;
        }
      }
      var full = html + sh_searchGroup("Events", eHtml) + sh_searchGroup("Files", fHtml);
      if (!full) {
        box.innerHTML = '<div class="sh-search-group"><div class="sh-search-head">No results for &ldquo;' + P.esc(q) + '&rdquo;</div></div>';
      } else {
        box.innerHTML = full;
      }
      box.hidden = false;
      sh_wireSearchItems(box);
    }, function () {
      if (html) { box.innerHTML = html; box.hidden = false; sh_wireSearchItems(box); }
      else sh_searchClose();
    });
  }
  function sh_wireSearchItems(box) {
    var items = box.querySelectorAll(".sh-search-item"), i;
    for (i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function () {
        var act = this.getAttribute("data-act");
        sh_searchClose();
        if (act === "member") P.openProfile(this.getAttribute("data-id"));
        else if (act === "ann") P.showTab("announcements");
        else if (act === "event") P.showTab("events");
        else if (act === "file") {
          var u = this.getAttribute("data-url");
          if (u) window.open(u, "_blank", "noopener");
        }
      });
    }
  }
  var sh_searchInput = sh_el("sh_globalSearch");
  if (sh_searchInput) {
    sh_searchInput.addEventListener("input", function () {
      clearTimeout(sh_searchTimer);
      var q = sh_searchInput.value;
      sh_searchTimer = setTimeout(function () { sh_runSearch(q); }, 250);
    });
    sh_searchInput.addEventListener("focus", function () {
      if (sh_searchInput.value.trim().length >= 2) sh_runSearch(sh_searchInput.value);
    });
  }
  document.addEventListener("click", function (ev) {
    var d = sh_el("sh_searchResults"), s = sh_el("sh_globalSearch");
    if (d && !d.hidden && s && !s.contains(ev.target) && !d.contains(ev.target)) sh_searchClose();
  });

  /* ================= #66 QUICK ACTIONS (dashboard) ================= */
  function sh_qaGate() {
    var msgAll = sh_el("sh_qaMsgAll"), newEv = sh_el("sh_qaNewEvent"), bk = sh_el("sh_qaBackup");
    var role = (P.me && P.me.role) || "";
    var canEvent = P.isAdmin() || role === "president" || role === "vice_president";
    if (msgAll) msgAll.hidden = !P.canBroadcast();
    if (newEv) newEv.hidden = !canEvent;
    if (bk) bk.hidden = !P.isMainAdmin();
  }
  sh_qaGate();
  sh_on("sh_qaMsgAll", "click", function () {
    P.showTab("messages");
    var sel = sh_el("dmTo");
    if (sel) {
      /* "__ALL__" verified in portal.js fillDmRecipients (line ~681). */
      sel.value = "__ALL__";
      try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    }
    var body = sh_el("dmBody");
    if (body) body.focus();
  });
  sh_on("sh_qaNewEvent", "click", function () { P.showTab("events"); });
  sh_on("sh_qaBackup", "click", function () {
    var b = sh_el("backupBtn");
    if (b) b.click();
    else P.showTab("admin");
  });

  /* ================= #69 / #76 ANNOUNCEMENT PREVIEW ================= */
  function sh_renderPreview() {
    var box = sh_el("sh_annPreviewBox"), bodyEl = sh_el("annBody"), audEl = sh_el("annAudience");
    if (!box || !bodyEl) return;
    var body = bodyEl.value.trim();
    if (!body) {
      box.innerHTML = '<p class="empty">Type your announcement above, then tap Preview.</p>';
      return;
    }
    var aud = audEl ? audEl.value : "everyone";
    var audLabel = aud === "officials" ? "Officials only" : (aud === "members" ? "Members only" : "Everyone");
    box.innerHTML = '<div class="row-item"><div class="body">' +
      '<b>' + P.esc(P.me ? P.me.name : "You") + '</b> <span class="chip orange">Preview</span>' +
      '<div class="meta">just now &middot; ' + P.esc(audLabel) + '</div>' +
      '<p>' + P.esc(body) + '</p></div></div>';
  }
  sh_on("sh_annPreviewBtn", "click", function () {
    var box = sh_el("sh_annPreviewBox");
    if (box) box.hidden = false;
    sh_renderPreview();
  });
  var sh_annBody = sh_el("annBody");
  if (sh_annBody) {
    sh_annBody.addEventListener("input", function () {
      var box = sh_el("sh_annPreviewBox");
      if (box && !box.hidden) sh_renderPreview();
    });
  }

  /* ================= #86 ONE-TAP CALL / WHATSAPP ================= */
  function sh_addCallLinks(line) {
    if (!line || line.querySelector(".sh-call-links")) return;
    var text = line.textContent || "";
    var m = text.match(/Mobile:\s*([+\d][\d\s\-()]*)/);
    if (!m) return;
    var digits = sh_digits(m[1]);
    if (digits.length < 10) return;
    var wa = sh_waNumber(digits);
    var span = document.createElement("span");
    span.className = "sh-call-links";
    span.innerHTML = ' <a class="sh-call" href="tel:+' + P.esc(digits) + '">\uD83D\uDCDE Call</a>' +
      ' <a class="sh-call" href="https://wa.me/' + P.esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>';
    line.appendChild(span);
  }
  function sh_scanContacts(root) {
    if (!root || !root.querySelectorAll) return;
    var lines = root.querySelectorAll(".contact-line"), i;
    for (i = 0; i < lines.length; i++) sh_addCallLinks(lines[i]);
  }
  /* member list: contact lines appear via the existing "Show contact" flow */
  var sh_memberList = sh_el("memberList");
  if (sh_memberList) {
    sh_scanContacts(sh_memberList);
    var sh_mo = new MutationObserver(function () { sh_scanContacts(sh_memberList); });
    sh_mo.observe(sh_memberList, { childList: true, subtree: true });
  }
  /* profile modal: contact line is rendered by portal.js openProfile */
  var sh_profileBody = sh_el("profileBody");
  if (sh_profileBody) {
    var sh_po = new MutationObserver(function () { sh_scanContacts(sh_profileBody); });
    sh_po.observe(sh_profileBody, { childList: true, subtree: true });
  }

  /* ================= #87 COPY JOIN LINK ================= */
  function sh_copyJoin(btn) {
    function done(ok) {
      if (!btn) return;
      var orig = btn.getAttribute("data-label") || btn.textContent;
      btn.setAttribute("data-label", orig);
      btn.textContent = ok ? "Copied \u2713" : "Copy failed — long-press the link";
      setTimeout(function () { btn.textContent = orig; }, 2000);
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = sh_JOIN_URL;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sh_JOIN_URL).then(function () { done(true); }, function () { fallback(); });
    } else fallback();
  }
  var sh_joinBtns = document.querySelectorAll(".sh-copy-join");
  for (var sh_i = 0; sh_i < sh_joinBtns.length; sh_i++) {
    (function (b) { b.addEventListener("click", function () { sh_copyJoin(b); }); })(sh_joinBtns[sh_i]);
  }

  /* ================= #16 / #34 CLUB GALLERY ================= */
  function sh_canUpload() { return P.isOfficialOrAbove(); }
  function sh_canDelete(photo) {
    return P.isMainAdmin() || P.isSecondAdmin() || (P.me && photo.uploaded_by === P.me.id);
  }
  function sh_galleryPathFromUrl(url) {
    var m = String(url || "").split("/club-files/");
    return m.length > 1 ? m[1].split("?")[0] : null;
  }
  function sh_renderGallery(rows) {
    var grid = sh_el("sh_galleryGrid");
    if (!grid) return;
    if (!rows.length) {
      grid.innerHTML = '<p class="empty">No photos yet — be the first to share one from an event or rehearsal.</p>';
      return;
    }
    var html = "", i;
    for (i = 0; i < rows.length; i++) {
      var ph = rows[i];
      var up = (P.directoryById && P.directoryById[ph.uploaded_by]) || null;
      html += '<figure class="sh-photo"><img src="' + P.esc(ph.url) + '" alt="' + P.esc(ph.caption || "Club photo") + '" loading="lazy" />' +
        '<figcaption>' + P.esc(ph.caption || "") +
        '<span class="muted"> — ' + P.esc(up ? up.name : "Member") + ' · ' + P.esc(P.timeAgo(ph.created_at)) + '</span>' +
        (sh_canDelete(ph) ? ' <button class="btn ghost small sh-photo-del" type="button" data-id="' + P.esc(ph.id) + '" data-url="' + P.esc(ph.url) + '">Delete</button>' : "") +
        '</figcaption></figure>';
    }
    grid.innerHTML = html;
    var dels = grid.querySelectorAll(".sh-photo-del"), j;
    for (j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        if (!window.confirm("Delete this photo?")) return;
        var id = this.getAttribute("data-id"), url = this.getAttribute("data-url");
        var path = sh_galleryPathFromUrl(url);
        P.client.from("gallery_photos").delete().eq("id", id).then(function (res) {
          if (res.error) { window.alert("Could not delete: " + res.error.message); return; }
          if (path) P.client.storage.from("club-files").remove([path]).then(function () {}, function () {});
          sh_loadGallery();
        }, function (e) { window.alert("Could not delete: " + e.message); });
      });
    }
  }
  function sh_loadGallery() {
    var grid = sh_el("sh_galleryGrid");
    if (!grid) return;
    P.client.from("gallery_photos").select("id,url,caption,event_id,uploaded_by,created_at")
      .order("created_at", { ascending: false }).limit(60)
      .then(function (res) {
        if (res.error) { grid.innerHTML = '<p class="empty">Could not load the gallery.</p>'; return; }
        sh_renderGallery(res.data || []);
      }, function () { grid.innerHTML = '<p class="empty">Could not load the gallery.</p>'; });
  }
  function sh_galleryGate() {
    var up = sh_el("sh_galleryUpload");
    if (up) up.hidden = !sh_canUpload();
    var hint = sh_el("sh_galleryHint");
    if (hint) hint.textContent = sh_canUpload()
      ? "Uploads are for officials. Everyone in the club can view the photos."
      : "Only officials can upload photos. You can view the gallery below.";
  }
  sh_on("sh_galleryUploadBtn", "click", function () {
    var fileEl = sh_el("sh_galleryFile"), capEl = sh_el("sh_galleryCaption");
    var msgEl = sh_el("sh_galleryMsg");
    if (!fileEl || !fileEl.files || !fileEl.files[0]) {
      if (msgEl) { msgEl.textContent = "Choose a photo first."; msgEl.className = "msg show err"; }
      return;
    }
    var file = fileEl.files[0];
    if (file.size > 5 * 1024 * 1024) {
      if (msgEl) { msgEl.textContent = "Photo is too large — max 5 MB."; msgEl.className = "msg show err"; }
      return;
    }
    var btn = sh_el("sh_galleryUploadBtn");
    if (btn) btn.disabled = true;
    var path = "gallery/" + Date.now() + "-" + String(file.name).replace(/[^A-Za-z0-9._-]/g, "_");
    P.client.storage.from("club-files").upload(path, file, { cacheControl: "3600", upsert: false })
      .then(function (upRes) {
        if (upRes.error) throw new Error(upRes.error.message);
        var pub = P.client.storage.from("club-files").getPublicUrl(path);
        var url = pub && pub.data ? pub.data.publicUrl : "";
        var evSel = sh_el("sh_galleryEvent");
        return P.client.from("gallery_photos").insert({
          url: url,
          caption: capEl ? capEl.value.trim() : "",
          event_id: (evSel && evSel.value) ? evSel.value : null,
          uploaded_by: P.me.id
        });
      })
      .then(function (insRes) {
        if (btn) btn.disabled = false;
        if (insRes.error) {
          if (msgEl) { msgEl.textContent = "Could not save the photo: " + insRes.error.message; msgEl.className = "msg show err"; }
          return;
        }
        if (msgEl) { msgEl.textContent = "Photo added to the gallery."; msgEl.className = "msg show ok"; }
        if (fileEl) fileEl.value = "";
        if (capEl) capEl.value = "";
        sh_loadGallery();
      }, function (e) {
        if (btn) btn.disabled = false;
        if (msgEl) { msgEl.textContent = "Upload failed: " + e.message; msgEl.className = "msg show err"; }
      });
  });
  /* event picker for gallery uploads (best effort — events table may be empty) */
  var sh_evSel = sh_el("sh_galleryEvent");
  if (sh_evSel) {
    P.client.from("events").select("id,title").order("starts_at", { ascending: false }).limit(30)
      .then(function (res) {
        if (res.error || !res.data) return;
        res.data.forEach(function (ev) {
          var o = document.createElement("option");
          o.value = ev.id; o.textContent = ev.title || "Event";
          sh_evSel.appendChild(o);
        });
      }, function () {});
  }
  sh_galleryGate();
  sh_loadGallery();

  /* ================= #90 WHAT'S NEW POPUP ================= */
  var sh_seen = null;
  try { sh_seen = window.localStorage.getItem("rfc-seen-version"); } catch (e) {}
  if (sh_seen !== sh_VERSION) {
    var sh_wn = sh_el("sh_whatsNew");
    if (sh_wn) sh_wn.hidden = false;
  }
  sh_on("sh_whatsNewBtn", "click", function () {
    try { window.localStorage.setItem("rfc-seen-version", sh_VERSION); } catch (e) {}
    var sh_wn = sh_el("sh_whatsNew");
    if (sh_wn) sh_wn.hidden = true;
  });
}



/* ---------------- master init (Step 16) ---------------- */
window.__f91Init = function (P) {
  if (window.__f91Started) return;
  window.__f91Started = true;
  var parts = [f91InitEvents, f91InitFinance, f91InitEngage, f91InitPeople, f91InitShell];
  for (var i = 0; i < parts.length; i++) {
    try { parts[i](P); } catch (e) { console.error("f91 init failed:", parts[i].name, e); }
  }
};
/* If portal.js boot already finished before this file loaded, init now. */
if (window.Portal91 && window.Portal91.booted) {
  try { window.__f91Init(window.Portal91); } catch (e) { console.error(e); }
}
