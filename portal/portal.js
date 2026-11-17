/* ============================================================================
   REVA Fashion Club Portal — app logic (static frontend + Supabase)
   - Main client: the signed-in user's session.
   - Isolated client ("iso"): a second Supabase client with its own storage
     key, used ONLY for creating accounts and verifying email codes, so the
     creator is never signed out of their own session while doing it.
   - No secret key is used anywhere. The publishable key is public by design.
   ============================================================================ */
(function () {
  "use strict";

  var cfg = window.RFC_CONFIG;
  var client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
  var iso = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { storageKey: "rfc-portal-verify" }
  });

  var ROLE_LABELS = {
    member: "Member",
    core_member: "Core Member",
    president: "President",
    vice_president: "Vice President",
    secretary: "Secretary",
    treasurer: "Treasurer",
    creative_director: "Creative Director",
    head_of_design: "Head of Design",
    runway_lead: "Runway Lead",
    media_lead: "Media & Photography Lead",
    events_lead: "Events & Sponsorship Lead",
    second_admin: "Second Admin",
    admin: "Main Admin"
  };
  var DOOR_LABELS = { member: "Member", official: "Official", admin: "Admin" };
  // The offices: every role that counts as a club official (Official door,
  // can create Member / Core Member accounts, can post announcements).
  var OFFICE_ROLES = ["president", "vice_president", "secretary", "treasurer", "creative_director", "head_of_design", "runway_lead", "media_lead", "events_lead"];
  var ALL_ROLES = ["admin", "second_admin", "president", "vice_president", "secretary", "treasurer", "creative_director", "head_of_design", "runway_lead", "media_lead", "events_lead", "core_member", "member"];
  // The 8 permission switches a club role can have. Built-in roles keep
  // exactly the permissions they always had; custom roles get whichever
  // switches the Main Admin turns on. (club_roles table in the database.)
  var ROLE_PERMS = [
    { key: "can_view_contacts", label: "See members' contact details", short: "Contacts" },
    { key: "can_create_members", label: "Create Member accounts", short: "Create members" },
    { key: "can_create_officials", label: "Create Official accounts", short: "Create officials" },
    { key: "can_create_admins", label: "Create Admin accounts", short: "Create admins" },
    { key: "can_post_announcements", label: "Post announcements", short: "Announce" },
    { key: "can_view_applicants", label: "See Interested Applicants", short: "Applicants" },
    { key: "can_broadcast", label: "Message all members", short: "Broadcast" },
    { key: "can_update_mobile", label: "Update members' mobile numbers", short: "Update mobile" }
  ];
  // Fallback copy of the 13 built-in roles, used when the club_roles
  // table cannot be loaded yet (before the Step 15 SQL has been run).
  // Same doors and permissions as the database seed.
  var BUILTIN_ROLES = [
    { code: "admin", label: "Main Admin", door: "admin", can_view_contacts: true, can_create_members: true, can_create_officials: true, can_create_admins: true, can_post_announcements: true, can_view_applicants: true, can_broadcast: true, can_update_mobile: true, is_builtin: true },
    { code: "second_admin", label: "Second Admin", door: "admin", can_view_contacts: true, can_create_members: true, can_create_officials: true, can_create_admins: true, can_post_announcements: true, can_view_applicants: false, can_broadcast: true, can_update_mobile: true, is_builtin: true },
    { code: "president", label: "President", door: "official", can_view_contacts: true, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: true, can_broadcast: true, can_update_mobile: true, is_builtin: true },
    { code: "vice_president", label: "Vice President", door: "official", can_view_contacts: true, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: true, can_broadcast: true, can_update_mobile: true, is_builtin: true },
    { code: "secretary", label: "Secretary", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "treasurer", label: "Treasurer", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "creative_director", label: "Creative Director", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "head_of_design", label: "Head of Design", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "runway_lead", label: "Runway Lead", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "media_lead", label: "Media & Photography Lead", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "events_lead", label: "Events & Sponsorship Lead", door: "official", can_view_contacts: false, can_create_members: true, can_create_officials: false, can_create_admins: false, can_post_announcements: true, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "core_member", label: "Core Member", door: "member", can_view_contacts: false, can_create_members: false, can_create_officials: false, can_create_admins: false, can_post_announcements: false, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true },
    { code: "member", label: "Member", door: "member", can_view_contacts: false, can_create_members: false, can_create_officials: false, can_create_admins: false, can_post_announcements: false, can_view_applicants: false, can_broadcast: false, can_update_mobile: false, is_builtin: true }
  ];
  var clubRoles = BUILTIN_ROLES.slice(); // rows from club_roles, else the fallback above

  var me = null;          // my profile row
  var directory = [];     // public member list (list_members)
  var directoryById = {};
  var otpSentForMe = false;
  var adminRows = [];     // full member list (list_members_full), admins only
  var lastSignins = {};   // id -> last_sign_in_at, Main Admin only
  var lockdownOn = false; // Main Admin only
  var inboxItems = [];    // inbox rows (dm + report), for search/filter
  var auditRows = [];     // audit log rows, Main Admin only
  var applicantsRows = [];// application rows, for analytics / feed / CSV
  var annRows = [];       // announcement rows, for the activity feed
  var templatesCache = [];// saved announcement templates, Main Admin only
  var draftsCache = [];   // saved announcement drafts, Main Admin only
  var readCounts = {};    // announcement id -> number of readers
  var readCountsLoaded = false;
  var bulkSelected = [];  // admin-panel checkbox selection, Main Admin + Second Admin
  var convertAppId = null;// application being converted into a member
  var appsOpen = true;    // whether the public Join form accepts applications
  var memberFilter = { q: "", role: "all", sort: "newest" };
  var schedRows = [];     // scheduled announcements, Main Admin only
  var editingRoleCode = null; // role code being edited in the Club Roles tab
  var annSearchQ = "";    // announcement search text (everyone)
  // Application stages: New → Contacted → Shortlisted → Reviewed.
  var STAGE_LABELS = { new: "New", contacted: "Contacted", shortlisted: "Shortlisted", reviewed: "Reviewed" };

  /* ---------------- small helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function showMsg(el, text, kind) {
    el.textContent = text;
    el.className = "msg show " + (kind || "err");
  }
  function hideMsg(el) { el.textContent = ""; el.className = "msg"; }
  function initials(name) {
    return (name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase();
  }
  function timeAgo(isoDate) {
    var d = new Date(isoDate), now = new Date();
    var mins = Math.max(0, Math.round((now - d) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + " hr ago";
    var days = Math.round(hrs / 24);
    if (days < 7) return days + " day" + (days > 1 ? "s" : "") + " ago";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  // Main Admin = Varun (role 'admin'). Second Admin = role 'second_admin'.
  // Both admin levels sign in through the Admin door; only the Main Admin
  // can create another Main Admin, and the Main Admin account can never
  // be removed or have its role changed.
  function isMainAdmin() { return me && me.role === "admin"; }
  function isAdmin() { return me && (me.role === "admin" || me.role === "second_admin"); }
  function isSecondAdmin() { return me && me.role === "second_admin"; }
  function isPrivileged() { return me && (me.role === "admin" || me.role === "second_admin" || me.role === "president" || me.role === "vice_president"); }
  // Roles are read from the club_roles table (loaded at boot), so a
  // custom role works the same way a built-in one does. The checks
  // below ask the role's permission switches; the two code-based
  // helpers above stay for the powers that never move to a custom role
  // (Admin panel, audit log, suspend, lockdown, backup).
  function roleRow(code) {
    return clubRoles.filter(function (r) { return r.code === code; })[0] || null;
  }
  function hasPerm(perm) {
    if (!me) return false;
    var r = roleRow(me.role);
    return !!(r && r[perm]);
  }
  function doorOf(code) {
    var r = roleRow(code);
    if (r) return r.door;
    if (code === "admin" || code === "second_admin") return "admin";
    if (code === "member" || code === "core_member") return "member";
    return "official";
  }
  // "Interested Applicants" is only for roles with the view-applicants
  // permission — Main Admin, President and Vice Presidents. NOT Second
  // Admins, NOT other officials, NOT members.
  function canViewApplicants() { return hasPerm("can_view_applicants"); }
  function isOfficialOrAbove() { return me && me.door !== "member"; }
  function canCreate() {
    return hasPerm("can_create_members") || hasPerm("can_create_officials") || hasPerm("can_create_admins");
  }
  function canPostAnnouncement() { return hasPerm("can_post_announcements"); }
  function canViewContacts() { return hasPerm("can_view_contacts"); }
  function canBroadcast() { return hasPerm("can_broadcast"); }
  function canUpdateMobile() { return hasPerm("can_update_mobile"); }
  // Broadcast history and read receipts: Main Admin, President and Vice
  // Presidents (the roles that send or follow broadcasts) — not Second
  // Admins, not other officials.
  function canViewBroadcasts() { return me && (me.role === "admin" || me.role === "president" || me.role === "vice_president"); }
  function canViewReadReceipts() { return me && (me.role === "admin" || me.role === "president" || me.role === "vice_president"); }
  function doorForRole(role) { return doorOf(role); }
  // Which roles may I assign when creating an account?
  // Main Admin: any role. Second Admin: any role except Main Admin.
  // Everyone else: only roles whose door their switches allow.
  function creatableRoles() {
    if (isMainAdmin()) return ALL_ROLES.slice();
    if (isAdmin()) return ALL_ROLES.filter(function (r) { return r !== "admin"; });
    return ALL_ROLES.filter(function (r) {
      var d = doorOf(r);
      return (d === "member" && hasPerm("can_create_members"))
        || (d === "official" && hasPerm("can_create_officials"));
    });
  }
  // A member's photo if they uploaded one, else their initials.
  function avatarHtml(p) {
    if (p && p.avatar_url) {
      return '<div class="avatar has-photo" aria-hidden="true"><img src="' + esc(p.avatar_url) + '" alt="" /></div>';
    }
    return '<div class="avatar" aria-hidden="true">' + esc(initials(p ? p.name : "?")) + "</div>";
  }
  // Open the Messages tab with a DM addressed to one member.
  function messageMember(id) {
    document.querySelector('nav.tabs button[data-tab="messages"]').click();
    var sel = $("dmTo");
    if (sel) { sel.value = id; sel.dispatchEvent(new Event("change")); }
    var body = $("dmBody");
    if (body) body.focus();
  }

  /* Where magic-link emails should land: the portal shell (app.html),
     computed from this page's own address so it is always right — on
     GitHub Pages the site lives under /reva-fashion-club/, and on a
     future custom domain the same code still works. Without this,
     Supabase falls back to the dashboard's Site URL, which is what
     sent the link to a dead address. */
  function portalAppUrl() {
    return location.origin + location.pathname.replace(/\/[^/]*$/, "") + "/app.html";
  }
  // The sign-in page, for password-reset emails (the link in the email
  // lands here, and the page shows a "set a new password" form).
  function portalLoginUrl() {
    return location.origin + location.pathname.replace(/\/[^/]*$/, "") + "/login.html";
  }
  // Download a file the browser just built (CSV member list / JSON backup).
  function downloadFile(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- boot: session + profile ---------------- */
  async function boot() {
    var sess = await client.auth.getSession();
    if (!sess.data || !sess.data.session) { location.href = "./login.html"; return; }
    var user = sess.data.session.user;
    var prof = await client.from("profiles").select("*").eq("id", user.id).single();
    if (prof.error || !prof.data) {
      await client.auth.signOut();
      location.href = "./login.html";
      return;
    }
    me = prof.data;
    // Suspended accounts cannot use the portal at all.
    if (me.is_suspended) {
      await client.auth.signOut();
      location.href = "./login.html?suspended=1";
      return;
    }
    // Lockdown mode: only the Main Admin stays signed in.
    var lock = await client.rpc("get_lockdown");
    if (!lock.error && lock.data === true && me.role !== "admin") {
      await client.auth.signOut();
      location.href = "./login.html?locked=1";
      return;
    }
    // Roles first: every permission check below reads the loaded table.
    // If the table does not exist yet (Step 15 SQL not run), the
    // built-in fallback keeps the portal working exactly as before.
    await loadRoles();
    renderIdentity();
    setupTabs();
    setupCreateForm();
    setupMessages();
    setupAnnouncements();
    setupAdmin();
    setupSettings();
    setupMemberSearch();
    setupInboxTools();
    setupProfileModal();
    // Post any scheduled announcements whose time has come (only if I
    // may post announcements; the database checks again server-side).
    if (canPostAnnouncement()) {
      client.rpc("post_due_announcements").then(function () {}, function () {});
    }
    await refreshDirectory();
    await refreshDashboard();
    await refreshInbox();
    await refreshAnnouncements();
    if (canViewApplicants()) await refreshApplicants();
    if (isAdmin()) await refreshAdminList();
    if (canViewBroadcasts()) await refreshBroadcastHistory();
    if (isMainAdmin()) {
      await refreshAuditLog();
      await refreshLockdown();
      await refreshNeedsAttention();
      await refreshActivityFeed();
      await refreshApplicationsOpen();
      await refreshScheduled();
      setupRoles();
      await refreshRoles();
    }
  }

  // Load the club_roles table into clubRoles (labels, doors, permission
  // switches). On any error — table not created yet, network hiccup —
  // keep the built-in fallback so nothing else breaks.
  async function loadRoles() {
    var res = await client.from("club_roles").select("*").order("created_at", { ascending: true });
    if (res.error || !res.data || !res.data.length) return;
    clubRoles = res.data;
    // Keep the 13 built-ins in their usual order, custom roles after.
    var order = {};
    BUILTIN_ROLES.forEach(function (r, i) { order[r.code] = i; });
    clubRoles.sort(function (a, b) {
      var oa = (order[a.code] == null ? 100 : order[a.code]);
      var ob = (order[b.code] == null ? 100 : order[b.code]);
      if (oa !== ob) return oa - ob;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    ROLE_LABELS = {};
    ALL_ROLES = [];
    clubRoles.forEach(function (r) {
      ROLE_LABELS[r.code] = r.label;
      ALL_ROLES.push(r.code);
    });
    OFFICE_ROLES = clubRoles.filter(function (r) { return r.door === "official"; }).map(function (r) { return r.code; });
  }

  function renderIdentity() {
    $("whoName").textContent = me.name;
    $("whoRole").textContent = ROLE_LABELS[me.role] || me.role;
    $("whoDoor").textContent = DOOR_LABELS[me.door] + " door";
    $("dashName").textContent = me.name.split(" ")[0];
    $("setName").textContent = me.name;
    $("setRole").textContent = ROLE_LABELS[me.role];
    $("setContact").textContent = "Login ID: " + me.login_id + "  •  " + me.email + "  •  " + me.mobile;
    $("setAddedBy").textContent = "Added by " + (me.added_by_role === "admin" ? "Admin" : me.added_by + " (" + (ROLE_LABELS[me.added_by_role] || me.added_by_role) + ")");
    if (!canCreate()) $("tabCreate").hidden = true;
    if (!isAdmin()) $("tabAdmin").hidden = true;
    if (!canViewApplicants()) $("tabApplicants").hidden = true;
    $("tabAudit").hidden = !isMainAdmin();
    $("mainAdminTools").hidden = !isMainAdmin();
    $("tabRoles").hidden = !isMainAdmin();
    // Role-wise panels (Step 15): search for the Main Admin, Second
    // Admin, President and Vice Presidents; broadcast history for the
    // Main Admin, President and Vice Presidents; templates for the two
    // admin levels, drafts for anyone who can post announcements.
    $("memberSearchCard").hidden = !isPrivileged();
    $("memberFilteredCsvBtn").hidden = !isMainAdmin();
    $("inboxTools").hidden = !isMainAdmin();
    $("broadcastCard").hidden = !canViewBroadcasts();
    $("needsAttention").hidden = !isMainAdmin();
    $("activityFeed").hidden = !isMainAdmin();
    $("appCsvBtn").hidden = !isMainAdmin();
    $("annTemplatesBox").hidden = !(isMainAdmin() || isSecondAdmin() || canPostAnnouncement());
    $("annTemplatesPart").hidden = !(isMainAdmin() || isSecondAdmin());
    $("annDraftsPart").hidden = !canPostAnnouncement();
    $("annScheduleBox").hidden = !isMainAdmin();
    $("announcePostCard").hidden = !canPostAnnouncement();
    if (!me.email_verified) {
      $("verifyNotice").hidden = false;
      $("verifyEmailText").textContent = me.email;
      sendOtpToMe();
    }
  }

  function setupTabs() {
    document.querySelectorAll("nav.tabs button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("nav.tabs button").forEach(function (b) { b.setAttribute("aria-selected", "false"); });
        btn.setAttribute("aria-selected", "true");
        document.querySelectorAll("section.tab").forEach(function (s) { s.hidden = true; });
        $("tab-" + btn.getAttribute("data-tab")).hidden = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    $("signOutBtn").addEventListener("click", async function () {
      await client.auth.signOut();
      location.href = "./login.html";
    });
  }

  /* ---------------- directory (public columns only) ---------------- */
  async function refreshDirectory() {
    var res = await client.rpc("list_members");
    if (res.error) {
      $("memberList").innerHTML = '<p class="empty">Could not load members: ' + esc(res.error.message) + "</p>";
      return;
    }
    directory = res.data || [];
    directoryById = {};
    directory.forEach(function (p) { directoryById[p.id] = p; });
    renderDirectory();
    fillDmRecipients();
    $("statMembers").textContent = directory.length;
  }

  // Member search, filter and sort — Main Admin, Second Admin,
  // President and Vice Presidents. Only the Main Admin gets the
  // "Last sign-in" sort (the sign-in data is Main Admin only).
  function setupMemberSearch() {
    if (!isPrivileged()) return;
    // Only the Main Admin may search by login ID (they are private —
    // only he can see other people's). Everyone else searches by name.
    $("memberSearch").placeholder = isMainAdmin() ? "Search by name or login ID…" : "Search by name…";
    var roleSel = $("memberRoleFilter");
    roleSel.innerHTML = '<option value="all">All roles</option>' + ALL_ROLES.map(function (r) {
      return '<option value="' + r + '">' + ROLE_LABELS[r] + "</option>";
    }).join("");
    if (!isMainAdmin()) {
      var signinOpt = $("memberSort").querySelector('option[value="signin"]');
      if (signinOpt) signinOpt.remove();
    }
    $("memberSearch").addEventListener("input", function () {
      memberFilter.q = $("memberSearch").value;
      renderDirectory();
    });
    roleSel.addEventListener("change", function () {
      memberFilter.role = roleSel.value;
      renderDirectory();
    });
    $("memberSort").addEventListener("change", async function () {
      memberFilter.sort = $("memberSort").value;
      if (memberFilter.sort === "signin" && !Object.keys(lastSignins).length) {
        var ls = await client.rpc("list_last_signins");
        if (!ls.error && ls.data) ls.data.forEach(function (r) { lastSignins[r.id] = r.last_sign_in_at; });
      }
      renderDirectory();
    });
    var filteredBtn = $("memberFilteredCsvBtn");
    if (filteredBtn) filteredBtn.addEventListener("click", downloadFilteredMembersCsv);
  }

  // Main Admin only: download a CSV of exactly the members the current
  // search / filter shows, not the whole club.
  function downloadFilteredMembersCsv() {
    var list = filteredDirectory();
    function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    var head = ["Name", "Login ID", "Role", "Door", "Email", "Mobile", "Joined"];
    var lines = list.map(function (p) {
      var full = (adminRows || []).filter(function (r) { return r.id === p.id; })[0] || {};
      return [p.name, p.login_id, ROLE_LABELS[p.role] || p.role, DOOR_LABELS[p.door] || p.door,
        full.email || "", full.mobile || "", p.created_at || ""].map(q).join(",");
    });
    downloadFile("reva-fashion-club-members-filtered-" + new Date().toISOString().slice(0, 10) + ".csv",
      head.map(q).join(",") + "\n" + lines.join("\n"), "text/csv;charset=utf-8");
  }

  function filteredDirectory() {
    var list = directory.slice();
    var q = memberFilter.q.trim().toLowerCase();
    if (q) list = list.filter(function (p) {
      // Login IDs are private: only the Main Admin may search by them.
      // Everyone else searches by name only, so a login ID cannot be
      // fished out by typing part of it.
      return (p.name || "").toLowerCase().indexOf(q) !== -1
        || (isMainAdmin() && (p.login_id || "").toLowerCase().indexOf(q) !== -1);
    });
    if (memberFilter.role !== "all") list = list.filter(function (p) { return p.role === memberFilter.role; });
    if (memberFilter.sort === "name") {
      list.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
    } else if (memberFilter.sort === "signin") {
      list.sort(function (a, b) {
        var ta = lastSignins[a.id] ? new Date(lastSignins[a.id]).getTime() : 0;
        var tb = lastSignins[b.id] ? new Date(lastSignins[b.id]).getTime() : 0;
        return tb - ta;
      });
    } else {
      list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    }
    return list;
  }

  function renderDirectory() {
    if (!directory.length) { $("memberList").innerHTML = '<p class="empty">No members yet.</p>'; return; }
    var list = filteredDirectory();
    if (!list.length) { $("memberList").innerHTML = '<p class="empty">No members match that search.</p>'; return; }
    $("memberList").innerHTML = list.map(function (p) {
      var self = p.id === me.id;
      return '<div class="row-item">' +
        avatarHtml(p) +
        '<div class="body"><b>' + esc(p.name) + "</b> " +
        '<span class="chip' + (p.role === "admin" || p.role === "second_admin" ? " orange" : p.role === "president" || p.role === "vice_president" ? "" : " ghost") + '">' + esc(ROLE_LABELS[p.role] || p.role) + "</span>" +
        '<div class="meta">' + (isMainAdmin() || self ? "Login ID: " + esc(p.login_id) + " &middot; " : "") + esc(DOOR_LABELS[p.door]) + " door" + (self ? " &middot; This is you" : "") + "</div>" +
        '<div class="contact-line" id="contact-' + esc(p.id) + '"></div>' +
        "</div>" +
        '<div class="actions"><button class="btn ghost small" type="button" data-contact="' + esc(p.id) + '">' +
        (self ? "My contact" : "Show contact") + "</button>" +
        (canUpdateMobile() && (p.role !== "admin" || self) ? '<button class="btn ghost small" type="button" data-mobile="' + esc(p.id) + '">Update mobile</button>' : "") +
        (isOfficialOrAbove() ? '<button class="btn ghost small" type="button" data-message="' + esc(p.id) + '">Message</button>' : "") +
        (isOfficialOrAbove() ? '<button class="btn ghost small" type="button" data-profile="' + esc(p.id) + '">View profile</button>' : "") + "</div>" +
        "</div>";
    }).join("");
    document.querySelectorAll("[data-contact]").forEach(function (btn) {
      btn.addEventListener("click", function () { revealContact(btn.getAttribute("data-contact"), btn); });
    });
    document.querySelectorAll("[data-mobile]").forEach(function (btn) {
      btn.addEventListener("click", function () { startMobileEdit(btn.getAttribute("data-mobile")); });
    });
    document.querySelectorAll("[data-message]").forEach(function (btn) {
      btn.addEventListener("click", function () { messageMember(btn.getAttribute("data-message")); });
    });
    document.querySelectorAll("[data-profile]").forEach(function (btn) {
      btn.addEventListener("click", function () { openProfile(btn.getAttribute("data-profile")); });
    });
  }

  async function revealContact(id, btn) {
    var box = $("contact-" + id);
    btn.disabled = true;
    btn.textContent = "Checking…";
    var res = await client.rpc("get_member_contact", { p_id: id });
    btn.disabled = false;
    btn.textContent = "Hide contact";
    if (res.error || !res.data || !res.data.length) {
      box.textContent = "Could not load contact details.";
      return;
    }
    var c = res.data[0];
    if (!c.email && !c.mobile) {
      box.textContent = "Contact details are only visible to the President, Vice Presidents and the Admin.";
    } else {
      box.textContent = "Email: " + (c.email || "—") + "  •  Mobile: " + (c.mobile || "—");
    }
    btn.onclick = function () { box.textContent = ""; btn.textContent = "Show contact"; btn.onclick = null; };
  }

  // Update a member's mobile number — only the Main Admin, Second Admin,
  // President and Vice Presidents ever see the button (renderDirectory
  // only adds it for isPrivileged), and the database function checks the
  // role again. Edits inline in the member's row: the current number is
  // loaded first, then Save writes just the mobile column.
  async function startMobileEdit(id) {
    var box = $("contact-" + id);
    var contactBtn = document.querySelector('[data-contact="' + id + '"]');
    var res = await client.rpc("get_member_contact", { p_id: id });
    if (res.error || !res.data || !res.data.length || !res.data[0].mobile) {
      box.textContent = "Could not load the current mobile number.";
      return;
    }
    box.innerHTML = "";
    var input = document.createElement("input");
    input.type = "tel"; input.value = res.data[0].mobile;
    input.setAttribute("aria-label", "New mobile number");
    input.style.marginBottom = "8px";
    var save = document.createElement("button");
    save.className = "btn small"; save.type = "button"; save.textContent = "Save";
    var cancel = document.createElement("button");
    cancel.className = "btn ghost small"; cancel.type = "button"; cancel.textContent = "Cancel";
    cancel.style.marginLeft = "8px";
    var err = document.createElement("div");
    err.className = "muted";
    box.appendChild(input); box.appendChild(save); box.appendChild(cancel); box.appendChild(err);
    if (contactBtn) { contactBtn.textContent = "Show contact"; contactBtn.onclick = null; }
    input.focus(); input.select();
    cancel.addEventListener("click", function () { box.textContent = ""; });
    save.addEventListener("click", async function () {
      var value = input.value.replace(/[^0-9]/g, "");
      if (value.length < 10) { err.textContent = "Enter the full mobile number (at least 10 digits)."; return; }
      save.disabled = true; save.textContent = "Saving…";
      var done = await client.rpc("update_member_mobile", { p_id: id, p_mobile: value });
      save.disabled = false; save.textContent = "Save";
      if (done.error) {
        err.textContent = /duplicate key/i.test(done.error.message)
          ? "That mobile number is already registered to another member."
          : "Could not update: " + done.error.message;
        return;
      }
      box.textContent = "Mobile updated to " + value + ".";
      if (id === me.id) {
        me.mobile = value;
        $("setContact").textContent = "Login ID: " + me.login_id + "  •  " + me.email + "  •  " + me.mobile;
      }
      if (isAdmin()) await refreshAdminList();
    });
  }

  function setupProfileModal() {
    $("profileClose").addEventListener("click", closeProfile);
    $("profileModal").addEventListener("click", function (e) {
      if (e.target === $("profileModal")) closeProfile();
    });
  }

  // Member profile view. Main Admin: everything — contact, who added
  // them, last sign-in and sign-in history, your private note, their
  // activity timeline, edit details, suspend. Other officials: the same
  // card read-only (details, contact as far as they may see it, who
  // added them) with just a Message button. Name and login ID can be
  // edited here; the email cannot (it would break sign-in).
  async function openProfile(id) {
    var p = directoryById[id];
    if (!p) return;
    var editable = isMainAdmin();
    var full = (adminRows || []).filter(function (r) { return r.id === id; })[0] || p;
    var contact = await client.rpc("get_member_contact", { p_id: id });
    var c = (!contact.error && contact.data && contact.data[0]) ? contact.data[0] : { email: null, mobile: null };
    var timeline = editable ? auditRows.filter(function (r) { return r.target_login_id === p.login_id; }) : [];
    var signins = [];
    if (editable) {
      var sh = await client.from("login_events").select("signed_in_at").eq("user_id", id).order("signed_in_at", { ascending: false }).limit(10);
      if (!sh.error && sh.data) signins = sh.data;
    }
    var html =
      '<div style="display:flex;gap:14px;align-items:flex-start">' +
      avatarHtml(p) +
      '<div class="body"><b style="font-size:18px">' + esc(p.name) + "</b> " +
      '<span class="chip' + (p.role === "admin" || p.role === "second_admin" ? " orange" : "") + '">' + esc(ROLE_LABELS[p.role] || p.role) + "</span>" +
      '<div class="meta">' + (editable || p.id === me.id ? "Login ID: " + esc(p.login_id) + " &middot; " : "") + esc(DOOR_LABELS[p.door]) + " door &middot; Joined " + esc(timeAgo(p.created_at)) + "</div>" +
      '<div class="contact-line">Email: ' + esc(c.email || "—") + "  •  Mobile: " + esc(c.mobile || "—") + "</div>" +
      '<div class="meta">Added by ' + (p.added_by_role === "admin" ? "Admin" : esc(p.added_by) + " (" + esc(ROLE_LABELS[p.added_by_role] || p.added_by_role) + ")") + "</div>" +
      (editable ? '<div class="meta">Last sign-in: ' + esc(lastSigninText(p.id)) + (full.is_suspended ? " &middot; <b>Suspended</b>" + (full.suspended_reason ? " — " + esc(full.suspended_reason) : "") : "") + "</div>" : "") +
      "</div></div>";
    if (editable) {
      html +=
        '<h2 class="sec">Edit <span class="serif-i">details</span></h2>' +
        '<label for="pfName">Full name</label><input id="pfName" type="text" value="' + esc(p.name) + '" />' +
        '<label for="pfLogin">Login ID</label><input id="pfLogin" type="text" value="' + esc(p.login_id) + '" />' +
        '<p class="field-hint">Small letters and numbers only. The email cannot be changed here — it would break the member\u2019s sign-in. If an email is wrong, remove the account and create a new one.</p>' +
        '<button class="btn small" type="button" id="pfSaveBtn">Save details</button> <span class="muted" id="pfSaveMsg"></span>' +
        '<h2 class="sec">Private <span class="serif-i">note</span></h2>' +
        '<p class="muted" style="margin-top:-6px">Only you can see this note.</p>' +
        '<textarea id="pfNote" placeholder="e.g. Lead choreographer — strong on formations." style="min-height:70px">' + esc(full.admin_notes || "") + "</textarea>" +
        '<button class="btn ghost small" type="button" id="pfNoteBtn">Save note</button> <span class="muted" id="pfNoteMsg"></span>' +
        '<h2 class="sec">Recent <span class="serif-i">sign-ins</span></h2>' +
        (signins.length ? signins.map(function (s) {
          return '<div class="meta" style="margin-bottom:6px">' + esc(timeAgo(s.signed_in_at)) + "</div>";
        }).join("") : '<p class="muted">No sign-ins recorded yet — history starts from the day it was switched on.</p>') +
        '<h2 class="sec">Recent <span class="serif-i">activity</span></h2>' +
        (timeline.length ? timeline.slice(0, 10).map(function (r) {
          return '<div class="meta" style="margin-bottom:6px">' + esc(timeAgo(r.created_at)) + " — <b>" + esc(r.actor_name || "SQL Editor") + "</b> " + esc(r.action) + (r.details ? ": " + esc(r.details) : "") + "</div>";
        }).join("") : '<p class="muted">No recorded activity for this member yet.</p>');
    }
    html +=
      '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">' +
      '<button class="btn small" type="button" id="pfMsgBtn">Message</button>' +
      (editable && p.role !== "admin" ? '<button class="btn ghost small" type="button" id="pfSuspBtn">' + (full.is_suspended ? "Unsuspend" : "Suspend") + "</button>" : "") +
      "</div>";
    $("profileBody").innerHTML = html;
    $("profileModal").hidden = false;
    if (editable) {
      $("pfLogin").addEventListener("input", function () {
        var clean = $("pfLogin").value.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (clean !== $("pfLogin").value) $("pfLogin").value = clean;
      });
      $("pfSaveBtn").addEventListener("click", async function () {
        var res = await client.rpc("update_member_details", { p_id: id, p_name: $("pfName").value.trim(), p_login_id: $("pfLogin").value.trim().toLowerCase() });
        if (res.error) { $("pfSaveMsg").textContent = res.error.message; return; }
        $("pfSaveMsg").textContent = "Saved.";
        await refreshDirectory();
        if (isAdmin()) await refreshAdminList();
      });
      $("pfNoteBtn").addEventListener("click", async function () {
        var res = await client.rpc("set_member_note", { p_id: id, p_note: $("pfNote").value });
        if (res.error) { $("pfNoteMsg").textContent = res.error.message; return; }
        $("pfNoteMsg").textContent = "Note saved.";
        if (isAdmin()) await refreshAdminList();
      });
    }
    $("pfMsgBtn").addEventListener("click", function () {
      closeProfile();
      messageMember(id);
    });
    var suspBtn = $("pfSuspBtn");
    if (suspBtn) suspBtn.addEventListener("click", async function () {
      var suspending = !full.is_suspended;
      var reason = null;
      if (suspending) {
        reason = window.prompt("Reason for suspending " + p.name + "? (optional — the member sees this when they try to sign in)");
        if (reason === null) return;
      } else if (!window.confirm("Unsuspend " + p.name + "? They will be able to sign in again.")) return;
      var res = await client.rpc("set_member_suspended", { p_id: id, p_suspended: suspending, p_reason: reason });
      if (res.error) { alert("Could not update: " + res.error.message); return; }
      closeProfile();
      await refreshDirectory();
      await refreshAdminList();
    });
  }
  function closeProfile() { $("profileModal").hidden = true; $("profileBody").innerHTML = ""; }

  function fillDmRecipients() {
    var sel = $("dmTo");
    var opts = "";
    // "All members" is only offered to roles with the broadcast
    // permission (Main Admin, Second Admin, President, Vice Presidents).
    // Everyone else only sees individual people. The submit handler
    // checks the permission again.
    if (canBroadcast()) {
      opts += '<option value="__ALL__">All members — everyone in the club</option>';
    }
    // Members ticked in the Admin panel (Main Admin + Second Admin).
    if (bulkSelected.length) {
      opts += '<option value="__BULK__">Selected members (' + bulkSelected.length + ")</option>";
    }
    opts += directory
      .filter(function (p) { return p.id !== me.id; })
      .map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name) + " — " + esc(ROLE_LABELS[p.role] || p.role) + "</option>";
      }).join("");
    sel.innerHTML = opts;
  }

  /* ---------------- dashboard ---------------- */
  async function refreshDashboard() {
    var ann = await client.from("messages").select("id").eq("kind", "announcement");
    $("statAnn").textContent = ann.error ? "–" : (ann.data || []).length;
    var unread = await client.from("messages").select("id").eq("recipient_id", me.id).eq("is_read", false).in("kind", ["dm", "report"]);
    var n = unread.error ? 0 : (unread.data || []).length;
    $("statUnread").textContent = n;
    var badge = $("msgBadge");
    badge.hidden = n === 0;
    badge.textContent = n;
    var feed = await client.from("messages").select("*").eq("kind", "announcement").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5);
    if (feed.error) { $("dashAnnouncements").innerHTML = '<p class="empty">Could not load announcements.</p>'; return; }
    if (!feed.data.length) { $("dashAnnouncements").innerHTML = '<p class="empty">No announcements yet.</p>'; return; }
    $("dashAnnouncements").innerHTML = feed.data.map(function (a) { return announcementHtml(a); }).join("");
    wireAnnouncementAdmin();
  }

  function announcementHtml(a) {
    var sender = directoryById[a.sender_id];
    return '<div class="row-item">' +
      avatarHtml(sender) +
      '<div class="body"><b>' + esc(sender ? sender.name : "Club") + "</b> " +
      '<span class="chip ghost">' + esc(a.audience === "everyone" ? "Everyone" : a.audience === "officials" ? "Officials only" : "Members only") + "</span>" +
      (a.pinned ? ' <span class="chip orange">Pinned</span>' : "") +
      '<div class="meta">' + esc(timeAgo(a.created_at)) + "</div>" +
      (canViewReadReceipts() && readCountsLoaded ? '<div class="meta">Read by ' + (readCounts[a.id] || 0) + " of " + audienceSize(a.audience) + "</div>" : "") +
      "<p>" + esc(a.body) + "</p></div>" +
      (isMainAdmin() ? '<div class="actions">' +
        '<button class="btn ghost small" type="button" data-ann-pin="' + esc(a.id) + '" data-ann-pinned="' + (a.pinned ? "1" : "0") + '">' + (a.pinned ? "Unpin" : "Pin") + "</button>" +
        '<button class="btn ghost small" type="button" data-ann-delete="' + esc(a.id) + '">Delete</button>' +
        "</div>" : "") +
      "</div>";
  }

  // How many people an announcement audience covers (read receipts).
  function audienceSize(audience) {
    if (audience === "officials") return directory.filter(function (p) { return p.door === "official" || p.door === "admin"; }).length;
    if (audience === "members") return directory.filter(function (p) { return p.door === "member"; }).length;
    return directory.length;
  }

  // Main Admin only: pin / unpin and delete any announcement. Wired after
  // every render of the announcement lists (dashboard + Announcements tab).
  function wireAnnouncementAdmin() {
    document.querySelectorAll("[data-ann-pin]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var next = btn.getAttribute("data-ann-pinned") !== "1";
        var res = await client.from("messages").update({ pinned: next }).eq("id", btn.getAttribute("data-ann-pin"));
        if (res.error) { alert("Could not change the pin: " + res.error.message); return; }
        await refreshAnnouncements();
        await refreshDashboard();
      });
    });
    document.querySelectorAll("[data-ann-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!window.confirm("Delete this announcement? This cannot be undone.")) return;
        var res = await client.from("messages").delete().eq("id", btn.getAttribute("data-ann-delete"));
        if (res.error) { alert("Could not delete the announcement: " + res.error.message); return; }
        await refreshAnnouncements();
        await refreshDashboard();
      });
    });
  }

  /* ---------------- messages ---------------- */
  // Broadcasts ("All members") are sent as one DM copy per member, each
  // with audience='members' as its marker. That reuses the existing DM
  // rules exactly: every recipient gets their own unread copy (and can
  // mark just their copy read), the sender sees all copies, and no
  // database change is needed — the audience column already allows
  // 'members'. Announcements are unaffected: they are filtered by kind,
  // and only announcements carry an audience chip there.
  function setupMessages() {
    $("dmTo").addEventListener("change", function () {
      var all = $("dmTo").value === "__ALL__";
      var bulk = $("dmTo").value === "__BULK__";
      $("dmAllHint").hidden = !all && !bulk;
      if (all) {
        var n = directory.filter(function (p) { return p.id !== me.id; }).length;
        $("dmAllHint").textContent = "Sending to All members delivers this message to everyone in the club (" +
          n + (n === 1 ? " person" : " people") + "). Each member gets their own copy in their inbox.";
      } else if (bulk) {
        $("dmAllHint").textContent = "Sending to the " + bulkSelected.length + " selected member" + (bulkSelected.length === 1 ? "" : "s") + " from the Admin panel.";
      }
    });

    $("dmForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg($("dmMsg"));
      var to = $("dmTo").value, subject = $("dmSubject").value.trim(), body = $("dmBody").value.trim();
      if (!to) { showMsg($("dmMsg"), "Choose who to message."); return; }
      if (!body) { showMsg($("dmMsg"), "Write a message first."); return; }

      // --- Send to all members (roles with the broadcast permission) ---
      if (to === "__ALL__") {
        if (!canBroadcast()) {
          showMsg($("dmMsg"), "Only the Main Admin, Second Admin, President and Vice Presidents can message all members.");
          return;
        }
        var targets = directory.filter(function (p) { return p.id !== me.id; });
        if (!targets.length) { showMsg($("dmMsg"), "There is nobody else in the club yet."); return; }
        if (!window.confirm("Send this message to all " + targets.length + " members? Every member will get their own copy in their inbox.")) return;
        $("dmSendBtn").disabled = true;
        var rows = targets.map(function (p) {
          return { sender_id: me.id, recipient_id: p.id, kind: "dm", subject: subject || null, body: body, audience: "members" };
        });
        var sent = await client.from("messages").insert(rows);
        $("dmSendBtn").disabled = false;
        if (sent.error) { showMsg($("dmMsg"), "Could not send: " + sent.error.message); return; }
        $("dmSubject").value = ""; $("dmBody").value = "";
        showMsg($("dmMsg"), "Message sent to all members (" + targets.length + " people).", "ok");
        await refreshInbox();
        return;
      }

      // --- Send to the members ticked in the Admin panel (Main Admin
      // and Second Admin) ---
      if (to === "__BULK__") {
        if (!(isMainAdmin() || isSecondAdmin())) {
          showMsg($("dmMsg"), "Only the Main Admin and Second Admin can message selected members.");
          return;
        }
        var bulkTargets = directory.filter(function (p) { return bulkSelected.indexOf(p.id) !== -1; });
        if (!bulkTargets.length) { showMsg($("dmMsg"), "No members are selected."); return; }
        if (!window.confirm("Send this message to " + bulkTargets.length + (bulkTargets.length === 1 ? " member" : " members") + "?")) return;
        $("dmSendBtn").disabled = true;
        var bulkRows = bulkTargets.map(function (p) {
          return { sender_id: me.id, recipient_id: p.id, kind: "dm", subject: subject || null, body: body };
        });
        var bulkSent = await client.from("messages").insert(bulkRows);
        $("dmSendBtn").disabled = false;
        if (bulkSent.error) { showMsg($("dmMsg"), "Could not send: " + bulkSent.error.message); return; }
        $("dmSubject").value = ""; $("dmBody").value = "";
        showMsg($("dmMsg"), "Message sent to " + bulkTargets.length + (bulkTargets.length === 1 ? " member." : " members."), "ok");
        await refreshInbox();
        return;
      }

      $("dmSendBtn").disabled = true;
      var res = await client.from("messages").insert({
        sender_id: me.id, recipient_id: to, kind: "dm", subject: subject || null, body: body
      });
      $("dmSendBtn").disabled = false;
      if (res.error) { showMsg($("dmMsg"), "Could not send: " + res.error.message); return; }
      $("dmSubject").value = ""; $("dmBody").value = "";
      showMsg($("dmMsg"), "Message sent.", "ok");
      await refreshInbox();
    });

    $("reportForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg($("reportMsg"));
      var body = $("reportBody").value.trim();
      if (!body) { showMsg($("reportMsg"), "Describe the problem first."); return; }
      $("reportSendBtn").disabled = true;
      var res = await client.from("messages").insert({
        sender_id: me.id, recipient_id: null, kind: "report",
        subject: $("reportKind").value, body: body
      });
      $("reportSendBtn").disabled = false;
      if (res.error) { showMsg($("reportMsg"), "Could not send the report: " + res.error.message); return; }
      $("reportBody").value = "";
      showMsg($("reportMsg"), "Report sent to the Admin. Thank you.", "ok");
    });
  }

  async function refreshInbox() {
    var res = await client.from("messages")
      .select("*").in("kind", ["dm", "report"]).order("created_at", { ascending: false }).limit(50);
    if (res.error) { $("inboxList").innerHTML = '<p class="empty">Could not load inbox: ' + esc(res.error.message) + "</p>"; return; }
    inboxItems = (res.data || []).filter(function (m) {
      if (m.kind === "report") return isAdmin() || m.sender_id === me.id;
      return m.recipient_id === me.id || m.sender_id === me.id;
    });
    renderInbox();
  }

  // Main Admin only: search the inbox by text or sender, filter it
  // (all / unread / reports / direct messages), and mark everything
  // read in one tap.
  function setupInboxTools() {
    if (!isMainAdmin()) return;
    $("inboxSearch").addEventListener("input", renderInbox);
    $("inboxFilter").addEventListener("change", renderInbox);
    $("markAllReadBtn").addEventListener("click", async function () {
      var res = await client.from("messages").update({ is_read: true })
        .eq("recipient_id", me.id).eq("is_read", false).in("kind", ["dm", "report"]);
      var res2 = await client.from("messages").update({ is_read: true })
        .eq("kind", "report").eq("is_read", false);
      if (res.error || res2.error) {
        alert("Could not mark messages read: " + ((res.error || res2.error).message));
        return;
      }
      await refreshInbox();
      await refreshDashboard();
      if (isMainAdmin()) await refreshNeedsAttention();
    });
  }

  function renderInbox() {
    var items = inboxItems;
    if (isMainAdmin()) {
      var q = ($("inboxSearch") ? $("inboxSearch").value : "").trim().toLowerCase();
      var kind = $("inboxFilter") ? $("inboxFilter").value : "all";
      if (kind === "unread") items = items.filter(function (m) { return (m.recipient_id === me.id || m.kind === "report") && !m.is_read; });
      else if (kind === "reports") items = items.filter(function (m) { return m.kind === "report"; });
      else if (kind === "dms") items = items.filter(function (m) { return m.kind === "dm"; });
      if (q) items = items.filter(function (m) {
        var sender = directoryById[m.sender_id];
        var hay = ((m.subject || "") + " " + (m.body || "") + " " + (sender ? sender.name : "")).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    if (!items.length) { $("inboxList").innerHTML = '<p class="empty">No messages yet. Your welcome message and any reports will appear here.</p>'; return; }
    // Collapse a broadcast into one row in the sender's inbox: the send
    // wrote one copy per member, all sharing sender, subject, body and
    // the exact created_at (one insert), so that tuple identifies a batch.
    // Recipients only ever see their own single copy (see the filter
    // above), so grouping never hides anyone's message from them.
    var rows = [];
    var bmap = {};
    items.forEach(function (m) {
      if (m.kind === "dm" && m.audience === "members" && m.sender_id === me.id) {
        var key = (m.subject || "") + "\u0000" + m.body + "\u0000" + m.created_at;
        if (!bmap[key]) { bmap[key] = { m: m, count: 0 }; rows.push(bmap[key]); }
        bmap[key].count++;
      } else {
        rows.push({ m: m, count: 1 });
      }
    });
    $("inboxList").innerHTML = rows.map(function (row) {
      var m = row.m;
      var sender = directoryById[m.sender_id];
      var toMe = m.recipient_id === me.id;
      // Reports have no recipient — the Admins can mark them read too.
      var unread = (toMe || (m.kind === "report" && isAdmin())) && !m.is_read;
      var isBroadcast = m.kind === "dm" && m.audience === "members";
      var label = m.kind === "report"
        ? "Report to Admin — " + esc(m.subject || "Report")
        : (m.sender_id === me.id
          ? (isBroadcast ? "To All members (" + row.count + (row.count === 1 ? " person" : " people") + ")" : "To " + esc((directoryById[m.recipient_id] || {}).name || "…"))
          : "From " + esc(sender ? sender.name : "…"));
      return '<div class="row-item' + (unread ? " unread" : "") + '">' +
        avatarHtml(sender) +
        '<div class="body"><b>' + label + "</b> " + (unread ? '<span class="chip orange">Unread</span>' : "") + (isBroadcast ? ' <span class="chip ghost">All members</span>' : "") +
        '<div class="meta">' + esc(timeAgo(m.created_at)) + (m.subject && m.kind === "dm" ? " &middot; " + esc(m.subject) : "") + "</div>" +
        "<p>" + esc(m.body) + "</p></div>" +
        ((unread || isMainAdmin()) ? '<div class="actions">' +
          (unread ? '<button class="btn ghost small" type="button" data-read="' + esc(m.id) + '">Mark read</button>' : "") +
          (isMainAdmin() ? '<button class="btn ghost small" type="button" data-msg-delete="' + esc(m.id) + '">Delete</button>' : "") +
          "</div>" : "") +
        "</div>";
    }).join("");
    document.querySelectorAll("[data-read]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        await client.from("messages").update({ is_read: true }).eq("id", btn.getAttribute("data-read"));
        await refreshInbox();
        await refreshDashboard();
      });
    });
    // Main Admin only: delete any DM or report (moderation).
    document.querySelectorAll("[data-msg-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!window.confirm("Delete this message? This cannot be undone.")) return;
        var res = await client.from("messages").delete().eq("id", btn.getAttribute("data-msg-delete"));
        if (res.error) { alert("Could not delete the message: " + res.error.message); return; }
        await refreshInbox();
        await refreshDashboard();
      });
    });
  }

  /* ---------------- announcements ---------------- */
  // Main Admin only: saved templates and drafts for announcements.
  async function loadAnnouncementTemplates() {
    var res = await client.from("announcement_templates").select("*").order("created_at", { ascending: false }).limit(50);
    if (res.error) return;
    templatesCache = (res.data || []).filter(function (t) { return t.kind === "template"; });
    draftsCache = (res.data || []).filter(function (t) { return t.kind === "draft"; });
    $("annTemplateSel").innerHTML = '<option value="">Load a template…</option>' + templatesCache.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.title) + "</option>";
    }).join("");
    $("annDraftSel").innerHTML = '<option value="">Load a draft…</option>' + draftsCache.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.title) + "</option>";
    }).join("");
  }

  function setupAnnouncements() {
    $("announceForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg($("annMsg"));
      var body = $("annBody").value.trim();
      if (!body) { showMsg($("annMsg"), "Write the announcement first."); return; }
      $("annPostBtn").disabled = true;
      var res = await client.from("messages").insert({
        sender_id: me.id, recipient_id: null, kind: "announcement",
        audience: $("annAudience").value, body: body
      });
      $("annPostBtn").disabled = false;
      if (res.error) { showMsg($("annMsg"), "Could not post: " + res.error.message); return; }
      $("annBody").value = "";
      showMsg($("annMsg"), "Announcement posted.", "ok");
      await refreshAnnouncements();
      await refreshDashboard();
    });

    // Search announcements — everyone. It filters the list already
    // loaded, so it works even before the next refresh.
    var annSearch = $("annSearch");
    if (annSearch) annSearch.addEventListener("input", function () {
      annSearchQ = annSearch.value.trim().toLowerCase();
      renderAnnouncements();
    });

    // Templates: Main Admin and Second Admin. Drafts: anyone who can
    // post announcements (officials and admins). The database only
    // returns the rows each role may see.
    var canTemplates = isMainAdmin() || isSecondAdmin();
    var canDrafts = canPostAnnouncement();
    if (!canTemplates && !canDrafts) return;
    loadAnnouncementTemplates();
    if (canTemplates) {
      $("annTemplateSel").addEventListener("change", function () {
        var t = templatesCache.filter(function (x) { return x.id === $("annTemplateSel").value; })[0];
        if (t) { $("annAudience").value = t.audience || "everyone"; $("annBody").value = t.body || ""; }
      });
      $("annSaveTemplateBtn").addEventListener("click", async function () {
        var body = $("annBody").value.trim();
        if (!body) { showMsg($("annMsg"), "Write the announcement first."); return; }
        var title = window.prompt("Name for this template? (e.g. Audition call)");
        if (title === null) return;
        var res = await client.from("announcement_templates").insert({
          kind: "template", title: title.trim() || "Untitled template",
          body: body, audience: $("annAudience").value, created_by: me.id
        });
        if (res.error) { showMsg($("annMsg"), "Could not save the template: " + res.error.message); return; }
        showMsg($("annMsg"), "Template saved.", "ok");
        await loadAnnouncementTemplates();
      });
    }
    if (canDrafts) {
      $("annDraftSel").addEventListener("change", function () {
        var d = draftsCache.filter(function (x) { return x.id === $("annDraftSel").value; })[0];
        if (d) { $("annAudience").value = d.audience || "everyone"; $("annBody").value = d.body || ""; }
      });
      $("annSaveDraftBtn").addEventListener("click", async function () {
        var body = $("annBody").value.trim();
        if (!body) { showMsg($("annMsg"), "Write the announcement first."); return; }
        var res = await client.from("announcement_templates").insert({
          kind: "draft", title: body.slice(0, 40) + (body.length > 40 ? "…" : ""),
          body: body, audience: $("annAudience").value, created_by: me.id
        });
        if (res.error) { showMsg($("annMsg"), "Could not save the draft: " + res.error.message); return; }
        showMsg($("annMsg"), "Draft saved.", "ok");
        await loadAnnouncementTemplates();
      });
      $("annDeleteDraftBtn").addEventListener("click", async function () {
        var id = $("annDraftSel").value;
        if (!id) return;
        if (!window.confirm("Delete this draft?")) return;
        await client.from("announcement_templates").delete().eq("id", id);
        await loadAnnouncementTemplates();
      });
    }
    // Schedule an announcement — Main Admin only. It posts the next
    // time someone who can post announcements opens the portal after
    // the scheduled time.
    if (isMainAdmin()) {
      var schedBtn = $("annSchedBtn");
      if (schedBtn) schedBtn.addEventListener("click", async function () {
        var body = $("annBody").value.trim();
        if (!body) { showMsg($("annMsg"), "Write the announcement first."); return; }
        var when = $("annSchedWhen").value;
        if (!when) { showMsg($("annMsg"), "Pick a date and time to schedule it."); return; }
        var at = new Date(when);
        if (isNaN(at.getTime()) || at.getTime() <= Date.now()) {
          showMsg($("annMsg"), "Pick a future date and time."); return;
        }
        var res = await client.from("scheduled_announcements").insert({
          subject: null, body: body, audience: $("annAudience").value,
          scheduled_for: at.toISOString(), created_by: me.id
        });
        if (res.error) { showMsg($("annMsg"), "Could not schedule: " + res.error.message); return; }
        $("annBody").value = ""; $("annSchedWhen").value = "";
        showMsg($("annMsg"), "Scheduled — it will post the next time someone opens the portal after " + at.toLocaleString() + ".", "ok");
        await refreshScheduled();
      });
    }
  }

  async function refreshAnnouncements() {
    var res = await client.from("messages").select("*").eq("kind", "announcement").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(30);
    if (res.error) { $("announceList").innerHTML = '<p class="empty">Could not load announcements.</p>'; return; }
    annRows = res.data || [];
    if (!annRows.length) { $("announceList").innerHTML = '<p class="empty">No announcements yet.</p>'; return; }
    // Read receipts: record that I have read the announcements I can see
    // (best effort — if the table does not exist yet, nothing breaks).
    var rows = annRows.map(function (a) { return { message_id: a.id, reader_id: me.id }; });
    client.from("message_reads").upsert(rows, { onConflict: "message_id,reader_id", ignoreDuplicates: true })
      .then(function () {}, function () {});
    if (canViewReadReceipts()) {
      var reads = await client.from("message_reads").select("message_id");
      readCounts = {};
      if (!reads.error && reads.data) reads.data.forEach(function (r) { readCounts[r.message_id] = (readCounts[r.message_id] || 0) + 1; });
      readCountsLoaded = true;
    }
    renderAnnouncements();
  }

  // Render the loaded announcements, filtered by the search box.
  function renderAnnouncements() {
    var list = annRows;
    if (annSearchQ) {
      list = list.filter(function (a) {
        var sender = directoryById[a.sender_id];
        return (a.body || "").toLowerCase().indexOf(annSearchQ) !== -1
          || (sender && (sender.name || "").toLowerCase().indexOf(annSearchQ) !== -1);
      });
    }
    if (!list.length) {
      $("announceList").innerHTML = '<p class="empty">' + (annSearchQ ? "No announcements match that search." : "No announcements yet.") + "</p>";
      return;
    }
    $("announceList").innerHTML = list.map(function (a) { return announcementHtml(a); }).join("");
    wireAnnouncementAdmin();
  }

  // Main Admin only: scheduled announcements waiting to post, and the
  // ones already posted. Cancel removes a waiting one.
  async function refreshScheduled() {
    var res = await client.from("scheduled_announcements").select("*").order("scheduled_for", { ascending: true }).limit(20);
    if (res.error) { $("schedList").innerHTML = '<p class="empty">Could not load scheduled announcements.</p>'; return; }
    schedRows = res.data || [];
    if (!schedRows.length) { $("schedList").innerHTML = '<p class="empty">Nothing scheduled.</p>'; return; }
    $("schedList").innerHTML = schedRows.map(function (s) {
      return '<div class="row-item">' +
        '<div class="body"><b>' + (s.posted ? "Posted" : "Scheduled for " + esc(new Date(s.scheduled_for).toLocaleString())) + "</b> " +
        '<span class="chip ghost">' + esc(s.audience === "everyone" ? "Everyone" : s.audience === "officials" ? "Officials only" : "Members only") + "</span>" +
        '<div class="meta">' + esc(timeAgo(s.created_at)) + "</div>" +
        "<p>" + esc(s.body) + "</p></div>" +
        (!s.posted ? '<div class="actions"><button class="btn ghost small" type="button" data-sched-cancel="' + esc(s.id) + '">Cancel</button></div>' : "") +
        "</div>";
    }).join("");
    document.querySelectorAll("[data-sched-cancel]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!window.confirm("Cancel this scheduled announcement?")) return;
        await client.from("scheduled_announcements").delete().eq("id", btn.getAttribute("data-sched-cancel"));
        await refreshScheduled();
      });
    });
  }

  // Main Admin only: every past "All members" broadcast, with how many
  // people each one reached. Broadcasts are one DM copy per member, all
  // sharing sender, subject, body and the exact created_at (one insert),
  // so that tuple identifies a batch — the same grouping as the inbox.
  async function refreshBroadcastHistory() {
    var res = await client.from("messages").select("*").eq("kind", "dm").eq("audience", "members").order("created_at", { ascending: false }).limit(200);
    if (res.error) { $("broadcastList").innerHTML = '<p class="empty">Could not load broadcast history.</p>'; return; }
    var groups = {};
    var order = [];
    (res.data || []).forEach(function (m) {
      var key = m.sender_id + "\u0000" + (m.subject || "") + "\u0000" + m.body + "\u0000" + m.created_at;
      if (!groups[key]) { groups[key] = { m: m, count: 0 }; order.push(groups[key]); }
      groups[key].count++;
    });
    if (!order.length) { $("broadcastList").innerHTML = '<p class="empty">No broadcasts yet. Messages sent to “All members” will appear here.</p>'; return; }
    $("broadcastList").innerHTML = order.slice(0, 20).map(function (g) {
      var m = g.m;
      var sender = directoryById[m.sender_id];
      return '<div class="row-item">' + avatarHtml(sender) +
        '<div class="body"><b>To All members (' + g.count + (g.count === 1 ? " person" : " people") + ")</b> " +
        '<span class="chip ghost">Broadcast</span>' +
        '<div class="meta">' + esc(timeAgo(m.created_at)) + " &middot; From " + esc(sender ? sender.name : "…") + (m.subject ? " &middot; " + esc(m.subject) : "") + "</div>" +
        "<p>" + esc(m.body) + "</p></div></div>";
    }).join("");
  }

  /* ---------------- interested applicants ---------------- */
  // Join-form submissions from the public website. Only the Main Admin,
  // President and Vice Presidents ever reach this code (the tab is hidden
  // for everyone else, and the database only lets those three roles read
  // the applications table). New ones carry a "New" chip and a count on
  // the tab; marking one reviewed clears it. Only the Main Admin can
  // remove an application.
  async function refreshApplicants() {
    var res = await client.from("applications").select("*").order("created_at", { ascending: false }).limit(100);
    if (res.error) { $("applicantList").innerHTML = '<p class="empty">Could not load applicants: ' + esc(res.error.message) + "</p>"; return; }
    var rows = res.data || [];
    applicantsRows = rows;
    var fresh = rows.filter(function (a) { return a.status === "new"; }).length;
    var badge = $("appBadge");
    badge.hidden = fresh === 0;
    badge.textContent = fresh;
    if (!rows.length) { $("applicantList").innerHTML = '<p class="empty">No applications yet. New Join-form submissions will appear here.</p>'; return; }
    $("applicantList").innerHTML = rows.map(function (a) {
      var isNew = a.status === "new";
      return '<div class="row-item' + (isNew ? " unread" : "") + '">' +
        '<div class="avatar" aria-hidden="true">' + esc(initials(a.name)) + "</div>" +
        '<div class="body"><b>' + esc(a.name) + "</b> " +
        '<span class="chip' + (isNew ? " orange" : " ghost") + '">' + esc(STAGE_LABELS[a.status] || a.status) + "</span>" +
        '<div class="meta">' + esc(a.vertical || "") + " &middot; " + esc(a.programme || "") + " &middot; " + esc(a.year || "") +
        (a.srn ? " &middot; SRN: " + esc(a.srn) : "") + " &middot; " + esc(timeAgo(a.created_at)) + "</div>" +
        (a.why ? "<p>" + esc(a.why) + "</p>" : '<p class="muted">No note given.</p>') +
        "</div>" +
        '<div class="actions">' +
        '<select data-app-stage="' + esc(a.id) + '" style="width:auto;margin:0">' +
        ["new", "contacted", "shortlisted", "reviewed"].map(function (st) {
          return '<option value="' + st + '"' + (a.status === st ? " selected" : "") + ">" + STAGE_LABELS[st] + "</option>";
        }).join("") + "</select>" +
        (canViewApplicants() ? '<button class="btn ghost small" type="button" data-app-convert="' + esc(a.id) + '">Make member</button>' : "") +
        (isMainAdmin() ? '<button class="btn ghost small" type="button" data-app-remove="' + esc(a.id) + '" data-app-name="' + esc(a.name) + '">Remove</button>' : "") +
        "</div></div>";
    }).join("");
    document.querySelectorAll("[data-app-stage]").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        var res = await client.from("applications").update({ status: sel.value }).eq("id", sel.getAttribute("data-app-stage"));
        if (res.error) { alert("Could not update the application: " + res.error.message); await refreshApplicants(); return; }
        await refreshApplicants();
        if (isMainAdmin()) await refreshNeedsAttention();
      });
    });
    document.querySelectorAll("[data-app-convert]").forEach(function (btn) {
      btn.addEventListener("click", function () { convertApplicant(btn.getAttribute("data-app-convert")); });
    });
    document.querySelectorAll("[data-app-remove]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var name = btn.getAttribute("data-app-name");
        if (!window.confirm("Remove " + name + "'s application? This cannot be undone.")) return;
        var res = await client.from("applications").delete().eq("id", btn.getAttribute("data-app-remove"));
        if (res.error) { alert("Could not remove the application: " + res.error.message); return; }
        await refreshApplicants();
      });
    });
  }

  // Turn an application into a member account in one tap: the Create
  // Account form opens with the applicant's name filled in. When the
  // account is created, the application is marked Reviewed and linked
  // to the new account (applications.converted_to).
  function convertApplicant(appId) {
    var a = (applicantsRows || []).filter(function (x) { return x.id === appId; })[0];
    if (!a) return;
    convertAppId = appId;
    document.querySelector('nav.tabs button[data-tab="create"]').click();
    $("cName").value = a.name;
    $("cRole").value = "member";
    updatePreview();
    $("createLede").textContent = "Creating an account for applicant " + a.name + " — " + (a.programme || "") + ", " + (a.year || "") + ", " + (a.vertical || "") + ". Their email and mobile still need to be entered below (the Join form does not ask for them).";
    $("cEmail").focus();
  }

  // Main Admin only: download the applicants as a CSV file.
  function downloadApplicantsCsv() {
    var head = ["Name", "SRN", "Programme", "Year", "Vertical", "Why", "Status", "Applied"];
    function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    var lines = (applicantsRows || []).map(function (a) {
      return [a.name, a.srn || "", a.programme, a.year, a.vertical, a.why || "", STAGE_LABELS[a.status] || a.status, a.created_at || ""].map(q).join(",");
    });
    downloadFile("reva-fashion-club-applicants-" + new Date().toISOString().slice(0, 10) + ".csv",
      head.map(q).join(",") + "\n" + lines.join("\n"), "text/csv;charset=utf-8");
  }

  /* ---------------- email OTP (my own account) ---------------- */
  async function sendOtpToMe() {
    if (otpSentForMe) return;
    otpSentForMe = true;
    var res = await client.auth.signInWithOtp({ email: me.email, options: { shouldCreateUser: false, emailRedirectTo: portalAppUrl() } });
    if (res.error) showMsg($("otpMsg"), "Could not send the code: " + res.error.message);
  }
  function setupOtp() {
    $("otpResendBtn").addEventListener("click", async function () {
      otpSentForMe = false;
      hideMsg($("otpMsg"));
      await sendOtpToMe();
      showMsg($("otpMsg"), "A new code was sent to " + me.email + ".", "ok");
    });
    $("otpVerifyBtn").addEventListener("click", async function () {
      var code = $("otpInput").value.replace(/[^0-9]/g, "");
      if (code.length !== 6) { showMsg($("otpMsg"), "Enter the 6-digit code from your email."); return; }
      $("otpVerifyBtn").disabled = true;
      var res = await client.auth.verifyOtp({ email: me.email, token: code, type: "email" });
      if (res.error) {
        $("otpVerifyBtn").disabled = false;
        showMsg($("otpMsg"), "That code did not work: " + res.error.message + " Try resending a new code.");
        return;
      }
      await client.rpc("mark_email_verified");
      me.email_verified = true;
      $("otpVerifyBtn").disabled = false;
      $("verifyNotice").hidden = true;
      showMsg($("otpMsg"), "Email verified. Welcome to the club!", "ok");
    });
    $("otpInput").addEventListener("input", function () {
      $("otpInput").value = $("otpInput").value.replace(/[^0-9]/g, "").slice(0, 6);
    });
  }

  /* ---------------- create account ---------------- */
  var newAccount = null; // { id, email } of the account just created (for OTP step)

  // Fill the create-account role select with exactly the roles I may
  // assign (creatableRoles). Called at boot and after any role change.
  function fillCreateRoleOptions() {
    var roleSel = $("cRole");
    if (!roleSel) return;
    var keep = roleSel.value;
    roleSel.innerHTML = creatableRoles().map(function (r) {
      return '<option value="' + r + '">' + ROLE_LABELS[r] + "</option>";
    }).join("");
    if (keep && creatableRoles().indexOf(keep) !== -1) roleSel.value = keep;
    updatePreview();
  }

  function setupCreateForm() {
    if (!canCreate()) return;
    fillCreateRoleOptions();
    $("roleHint").textContent = isMainAdmin()
      ? "Main Admin: you can assign any role, including another Main Admin."
      : isAdmin()
      ? "Second Admin: you can create Second Admins and any other role, except Main Admin."
      : "You can create accounts for the roles your permissions allow. Other roles are assigned by the Admins.";

    // Login ID rule: small letters and numbers only — lowercased and
    // stripped of capitals, spaces and symbols as typed.
    $("cLoginId").addEventListener("input", function () {
      var clean = $("cLoginId").value.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (clean !== $("cLoginId").value) $("cLoginId").value = clean;
      updatePreview();
    });
    // Temporary password mirrors the mobile number as typed.
    $("cMobile").addEventListener("input", function () {
      $("cMobile").value = $("cMobile").value.replace(/\s+/g, "");
      $("cTempPass").value = $("cMobile").value;
      updatePreview();
    });
    ["cName", "cRole", "cEmail"].forEach(function (id) {
      $(id).addEventListener("input", updatePreview);
    });
    updatePreview();

    $("createForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg($("createMsg"));
      var name = $("cName").value.trim();
      var role = $("cRole").value;
      var loginId = $("cLoginId").value.trim().toLowerCase();
      var email = $("cEmail").value.trim().toLowerCase();
      var mobile = $("cMobile").value.trim();
      if (!name) { showMsg($("createMsg"), "Enter the member's full name."); return; }
      if (!loginId) { showMsg($("createMsg"), "Enter a login ID (small letters and numbers only — no capitals, spaces or symbols)."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg($("createMsg"), "Enter a valid email address."); return; }
      if (mobile.length < 10) { showMsg($("createMsg"), "Enter the full mobile number (at least 10 digits)."); return; }
      if (role === "admin" && !isMainAdmin()) {
        showMsg($("createMsg"), "Only the Main Admin can create another Main Admin.");
        return;
      }
      if (creatableRoles().indexOf(role) === -1) {
        showMsg($("createMsg"), "Your role cannot create that kind of account. Choose one of the roles listed.");
        return;
      }
      $("createBtn").disabled = true;
      $("createBtn").textContent = "Checking…";
      try {
        // Step 1: duplicate check (login ID, email, mobile).
        var dup = await client.rpc("check_duplicates", { p_login_id: loginId, p_email: email, p_mobile: mobile });
        if (dup.error) throw dup.error;
        var d = dup.data[0];
        var taken = [];
        if (d.login_id_taken) taken.push("login ID “" + loginId + "” is already taken");
        if (d.email_taken) taken.push("email “" + email + "” is already registered");
        if (d.mobile_taken) taken.push("mobile number is already registered");
        if (taken.length) { showMsg($("createMsg"), "This account cannot be created: " + taken.join("; ") + "."); return; }

        // Step 2: create the Auth user on the isolated client, so the
        // creator stays signed in. Temporary password = mobile number.
        $("createBtn").textContent = "Creating account…";
        var signUp = await iso.auth.signUp({ email: email, password: mobile });
        if (signUp.error) {
          if (/already registered|already exists/i.test(signUp.error.message)) {
            showMsg($("createMsg"), "That email is already registered. Use a different email, or ask the Admin to check the member list.");
          } else {
            showMsg($("createMsg"), "Could not create the login: " + signUp.error.message);
          }
          return;
        }
        var newUserId = signUp.data.user && signUp.data.user.id;
        if (!newUserId) { showMsg($("createMsg"), "The account was not created. Please try again."); return; }

        // Step 3: profile row (audit trail is filled in by the database).
        var ins = await client.from("profiles").insert({
          id: newUserId, login_id: loginId, name: name, email: email, mobile: mobile, role: role
        });
        if (ins.error) {
          showMsg($("createMsg"), "Login created but the profile could not be saved: " + ins.error.message + " Ask the Admin to check the member list.");
          return;
        }

        // Step 4: welcome message in the portal.
        await client.from("messages").insert({
          sender_id: me.id, recipient_id: newUserId, kind: "dm",
          subject: "Welcome to REVA Fashion Club",
          body: "Welcome to the REVA Fashion Club, " + name.split(" ")[0] + "! Your login ID is " + loginId +
            " and your temporary password is your mobile number. Please change your password after your first sign-in (Settings → Change password). " +
            "If you ever spot a problem in the portal, use Messages → Report to Admin."
        });

        // If this account came from an application, mark it converted.
        if (convertAppId) {
          await client.from("applications").update({ status: "reviewed", converted_to: newUserId }).eq("id", convertAppId);
          convertAppId = null;
          $("createLede").textContent = "Create a new member account. The member signs in with their login ID, and their temporary password is their mobile number — they must change it after their first sign-in.";
          if (canViewApplicants()) await refreshApplicants();
        }

        newAccount = { id: newUserId, email: email };
        showMsg($("createMsg"),
          "Account created for " + name + " (" + ROLE_LABELS[role] + "). Login ID: " + loginId +
          ". Temporary password: the mobile number. Tell the member to sign in through the " +
          DOOR_LABELS[doorForRole(role)] +
          " door, then change the password.", "ok");
        $("createForm").reset();
        $("cTempPass").value = "";
        updatePreview();

        // Step 5: email OTP verification for the new account.
        $("verifyCard").hidden = false;
        $("verifyNewEmail").textContent = email;
        await sendOtpToNewAccount();
        await refreshDirectory();
        await refreshDashboard();
        if (isAdmin()) await refreshAdminList();
      } catch (err) {
        showMsg($("createMsg"), "Something went wrong: " + (err.message || err));
      } finally {
        $("createBtn").disabled = false;
        updateCreateBtn();
      }
    });

    $("newOtpVerifyBtn").addEventListener("click", async function () {
      if (!newAccount) return;
      var code = $("newOtpInput").value.replace(/[^0-9]/g, "");
      if (code.length !== 6) { showMsg($("newOtpMsg"), "Enter the 6-digit code from the member's email."); return; }
      $("newOtpVerifyBtn").disabled = true;
      var res = await iso.auth.verifyOtp({ email: newAccount.email, token: code, type: "email" });
      if (res.error) {
        $("newOtpVerifyBtn").disabled = false;
        showMsg($("newOtpMsg"), "That code did not work: " + res.error.message + " Try resending a new code.");
        return;
      }
      await iso.rpc("mark_email_verified");
      await iso.auth.signOut();
      $("newOtpVerifyBtn").disabled = false;
      showMsg($("newOtpMsg"), "Email verified for " + newAccount.email + ". The account is ready.", "ok");
      if (isAdmin()) await refreshAdminList();
    });
    $("newOtpResendBtn").addEventListener("click", async function () {
      if (!newAccount) return;
      hideMsg($("newOtpMsg"));
      await sendOtpToNewAccount();
      showMsg($("newOtpMsg"), "A new code was sent to " + newAccount.email + ".", "ok");
    });
    $("newOtpInput").addEventListener("input", function () {
      $("newOtpInput").value = $("newOtpInput").value.replace(/[^0-9]/g, "").slice(0, 6);
    });
  }

  async function sendOtpToNewAccount() {
    if (!newAccount) return;
    var res = await iso.auth.signInWithOtp({ email: newAccount.email, options: { shouldCreateUser: false, emailRedirectTo: portalAppUrl() } });
    if (res.error) showMsg($("newOtpMsg"), "Could not send the code: " + res.error.message + " The account still works — the member can verify from their dashboard later.");
  }

  function updateCreateBtn() {
    var role = $("cRole").value;
    $("createBtn").textContent = "Create " + (ROLE_LABELS[role] || "Member") + " account";
  }

  function updatePreview() {
    var name = $("cName").value.trim();
    var role = $("cRole").value;
    var loginId = $("cLoginId").value.trim();
    var email = $("cEmail").value.trim();
    var mobile = $("cMobile").value.trim();
    $("pvName").textContent = name || "New member";
    $("pvRole").textContent = ROLE_LABELS[role] || "Member";
    $("pvMeta").innerHTML =
      "Login ID: " + esc(loginId || "—") + "<br />Email: " + esc(email || "—") + "<br />Mobile: " + esc(mobile || "—");
    var door = doorForRole(role);
    $("pvDoor").innerHTML = "Signs in through the <b>" + DOOR_LABELS[door] + " Login</b> door.";
    var title = document.querySelector("#tab-create h1.page");
    if (title) title.innerHTML = "Create a <em>" + esc(ROLE_LABELS[role] || "Member") + " account</em>";
    updateCreateBtn();
  }

  /* ---------------- admin panel ---------------- */
  function setupAdmin() {
    if (!isAdmin()) return;
    // Bulk message (Main Admin + Second Admin) is wired for both admin
    // levels; everything else in this card is Main Admin only.
    var msgBtn = $("bulkMsgBtn");
    if (msgBtn) msgBtn.addEventListener("click", bulkMessage);
    var clearBtn = $("bulkClearBtn");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      bulkSelected = [];
      document.querySelectorAll("[data-bulk]").forEach(function (cb) { cb.checked = false; });
      updateBulkBar();
      fillDmRecipients();
    });
    if (!isMainAdmin()) {
      // Second Admins can tick members and message them, but never
      // suspend or remove anyone in bulk.
      ["bulkSuspendBtn", "bulkUnsuspendBtn", "bulkRemoveBtn"].forEach(function (id) {
        var b = $(id); if (b) b.hidden = true;
      });
      return;
    }
    var csvBtn = $("csvBtn");
    if (csvBtn) csvBtn.addEventListener("click", downloadMembersCsv);
    var backupBtn = $("backupBtn");
    if (backupBtn) backupBtn.addEventListener("click", downloadBackup);
    var lockBtn = $("lockdownBtn");
    if (lockBtn) lockBtn.addEventListener("click", toggleLockdown);
    var appsBtn = $("appsToggleBtn");
    if (appsBtn) appsBtn.addEventListener("click", toggleApplicationsOpen);
    var appCsvBtn = $("appCsvBtn");
    if (appCsvBtn) appCsvBtn.addEventListener("click", downloadApplicantsCsv);
    var auditCsvBtn = $("auditCsvBtn");
    if (auditCsvBtn) auditCsvBtn.addEventListener("click", downloadAuditCsv);
    var bulkBtn = $("bulkImportBtn");
    if (bulkBtn) bulkBtn.addEventListener("click", importMembersFromCsv);
    var sampleBtn = $("bulkSampleBtn");
    if (sampleBtn) sampleBtn.addEventListener("click", function () {
      downloadFile("reva-fashion-club-members-sample.csv",
        "Name,Login ID,Email,Mobile,Role\nAnanya Sharma,ananya01,ananya@example.com,9876501234,member\nRahul Verma,rahul02,rahul@example.com,9876501235,core_member\n",
        "text/csv;charset=utf-8");
    });
    var suspBtn = $("bulkSuspendBtn");
    if (suspBtn) suspBtn.addEventListener("click", function () { bulkSuspend(true); });
    var unsuspBtn = $("bulkUnsuspendBtn");
    if (unsuspBtn) unsuspBtn.addEventListener("click", function () { bulkSuspend(false); });
    var remBtn = $("bulkRemoveBtn");
    if (remBtn) remBtn.addEventListener("click", bulkRemove);
  }

  // Main Admin only: open / close the public Join form.
  async function refreshApplicationsOpen() {
    var res = await client.rpc("get_applications_open");
    if (!res.error) appsOpen = res.data !== false;
    var st = $("appsOpenStatus");
    if (st) st.textContent = appsOpen ? "Open — the Join form on the website is accepting applications." : "Closed — the Join form on the website is turned off.";
    var btn = $("appsToggleBtn");
    if (btn) btn.textContent = appsOpen ? "Close applications" : "Open applications";
  }
  async function toggleApplicationsOpen() {
    var next = !appsOpen;
    if (!window.confirm(next
      ? "Open applications? The Join form on the website will accept new applications."
      : "Close applications? The Join form on the website will stop accepting new applications (existing ones stay in the list).")) return;
    var res = await client.rpc("set_applications_open", { p_open: next });
    if (res.error) { alert("Could not change applications: " + res.error.message); return; }
    await refreshApplicationsOpen();
  }

  // Main Admin only: the bulk-action bar above the Admin panel list.
  function updateBulkBar() {
    var bar = $("bulkBar");
    if (!bar) return;
    bar.hidden = bulkSelected.length === 0;
    var n = bulkSelected.length;
    $("bulkCount").textContent = n + (n === 1 ? " member selected" : " members selected");
  }

  function bulkMessage() {
    if (!bulkSelected.length) return;
    document.querySelector('nav.tabs button[data-tab="messages"]').click();
    fillDmRecipients();
    $("dmTo").value = "__BULK__";
    $("dmTo").dispatchEvent(new Event("change"));
    $("dmBody").focus();
  }

  async function bulkSuspend(suspending) {
    var targets = adminRows.filter(function (p) { return bulkSelected.indexOf(p.id) !== -1 && p.role !== "admin"; });
    if (!targets.length) { alert("No suspendable members are selected (the Main Admin can never be suspended)."); return; }
    var reason = null;
    if (suspending) {
      reason = window.prompt("Reason for suspending " + targets.length + (targets.length === 1 ? " member" : " members") + "? (optional — they see this when they try to sign in)");
      if (reason === null) return;
    } else if (!window.confirm("Unsuspend " + targets.length + (targets.length === 1 ? " member" : " members") + "?")) return;
    var failed = [];
    for (var i = 0; i < targets.length; i++) {
      var res = await client.rpc("set_member_suspended", { p_id: targets[i].id, p_suspended: suspending, p_reason: reason });
      if (res.error) failed.push(targets[i].name + ": " + res.error.message);
    }
    bulkSelected = [];
    await refreshDirectory();
    await refreshAdminList();
    updateBulkBar();
    fillDmRecipients();
    if (failed.length) alert("Some could not be updated:\n" + failed.join("\n"));
  }

  async function bulkRemove() {
    var targets = adminRows.filter(function (p) { return bulkSelected.indexOf(p.id) !== -1 && p.role !== "admin"; });
    if (!targets.length) { alert("No removable members are selected (the Main Admin can never be removed)."); return; }
    if (!window.confirm("Remove " + targets.length + (targets.length === 1 ? " account" : " accounts") + " from the club? Their portal profiles will be deleted.")) return;
    var failed = [];
    for (var i = 0; i < targets.length; i++) {
      var res = await client.from("profiles").delete().eq("id", targets[i].id);
      if (res.error) failed.push(targets[i].name + ": " + res.error.message);
    }
    bulkSelected = [];
    await refreshDirectory();
    await refreshDashboard();
    await refreshAdminList();
    updateBulkBar();
    fillDmRecipients();
    if (failed.length) alert("Some could not be removed:\n" + failed.join("\n"));
  }

  // Parse a simple CSV (handles quoted fields with commas and quotes).
  function parseCsv(text) {
    var rows = [], row = [], field = "", inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Create one account without touching the form (used by bulk import).
  // Same steps as the form: duplicate check → Auth sign-up (temp password
  // = mobile) → profile row → welcome DM. Returns { ok: true, id } or
  // { ok: false, error }.
  async function createOneAccount(a) {
    var dup = await client.rpc("check_duplicates", { p_login_id: a.loginId, p_email: a.email, p_mobile: a.mobile });
    if (dup.error) return { ok: false, error: dup.error.message };
    var d = dup.data[0];
    if (d.login_id_taken) return { ok: false, error: "login ID already taken" };
    if (d.email_taken) return { ok: false, error: "email already registered" };
    if (d.mobile_taken) return { ok: false, error: "mobile already registered" };
    var signUp = await iso.auth.signUp({ email: a.email, password: a.mobile });
    if (signUp.error) return { ok: false, error: signUp.error.message };
    var newUserId = signUp.data.user && signUp.data.user.id;
    if (!newUserId) return { ok: false, error: "account was not created" };
    var ins = await client.from("profiles").insert({
      id: newUserId, login_id: a.loginId, name: a.name, email: a.email, mobile: a.mobile, role: a.role
    });
    if (ins.error) return { ok: false, error: "profile could not be saved: " + ins.error.message };
    await client.from("messages").insert({
      sender_id: me.id, recipient_id: newUserId, kind: "dm",
      subject: "Welcome to REVA Fashion Club",
      body: "Welcome to the REVA Fashion Club, " + a.name.split(" ")[0] + "! Your login ID is " + a.loginId +
        " and your temporary password is your mobile number. Please change your password after your first sign-in (Settings → Change password). " +
        "If you ever spot a problem in the portal, use Messages → Report to Admin."
    });
    return { ok: true, id: newUserId };
  }

  // Main Admin only: create many accounts at once from a CSV file.
  // Header row: Name, Login ID, Email, Mobile, Role (role codes: member,
  // core_member, president, vice_president, secretary, treasurer,
  // creative_director, head_of_design, runway_lead, media_lead,
  // events_lead, second_admin, admin).
  async function importMembersFromCsv() {
    var file = $("bulkFile").files && $("bulkFile").files[0];
    var out = $("bulkResult");
    if (!file) { out.textContent = "Choose a CSV file first."; return; }
    var text = await file.text();
    var rows = parseCsv(text);
    if (!rows.length) { out.textContent = "That file looks empty."; return; }
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var ci = {
      name: head.indexOf("name"),
      login: head.indexOf("login id"),
      email: head.indexOf("email"),
      mobile: head.indexOf("mobile"),
      role: head.indexOf("role")
    };
    if (ci.name === -1 || ci.login === -1 || ci.email === -1 || ci.mobile === -1) {
      out.textContent = "The first row must be the header: Name, Login ID, Email, Mobile, Role. Use the sample file to see the format.";
      return;
    }
    var created = 0, skipped = [];
    var btn = $("bulkImportBtn");
    btn.disabled = true; btn.textContent = "Importing…";
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r.length || r.every(function (v) { return (v || "").trim() === ""; })) continue;
      var name = (r[ci.name] || "").trim();
      var loginId = (r[ci.login] || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      var email = (r[ci.email] || "").trim().toLowerCase();
      var mobile = (r[ci.mobile] || "").replace(/[^0-9]/g, "");
      var role = ((r[ci.role] || "member").trim().toLowerCase().replace(/[^a-z_]/g, "")) || "member";
      if (!name || !loginId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || mobile.length < 10 || ALL_ROLES.indexOf(role) === -1) {
        skipped.push("Row " + (i + 1) + ": check the name, login ID, email, mobile and role.");
        continue;
      }
      var res = await createOneAccount({ name: name, loginId: loginId, email: email, mobile: mobile, role: role });
      if (res.ok) created++;
      else skipped.push("Row " + (i + 1) + " (" + name + "): " + res.error);
      await new Promise(function (done) { setTimeout(done, 400); });
    }
    btn.disabled = false; btn.textContent = "Import members";
    out.textContent = "Created " + created + " account" + (created === 1 ? "" : "s") + "." +
      (skipped.length ? " Skipped " + skipped.length + ": " + skipped.join(" ") : "") +
      (skipped.some(function (s) { return /rate|too many/i.test(s); }) ? " If several failed with a rate-limit message, wait an hour and retry just those rows." : "");
    await refreshDirectory();
    await refreshDashboard();
    if (isAdmin()) await refreshAdminList();
  }

  // Main Admin only: download the member list as a CSV file.
  function downloadMembersCsv() {
    var head = ["Name", "Login ID", "Role", "Door", "Email", "Mobile", "Email verified", "Suspended", "Added by", "Joined"];
    function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    var lines = adminRows.map(function (p) {
      return [p.name, p.login_id, ROLE_LABELS[p.role] || p.role, DOOR_LABELS[p.door] || p.door,
        p.email || "", p.mobile || "", p.email_verified ? "Yes" : "No", p.is_suspended ? "Yes" : "No",
        p.added_by || "", p.created_at || ""].map(q).join(",");
    });
    downloadFile("reva-fashion-club-members-" + new Date().toISOString().slice(0, 10) + ".csv",
      head.map(q).join(",") + "\n" + lines.join("\n"), "text/csv;charset=utf-8");
  }

  // Main Admin only: download everything the Main Admin can see —
  // members, messages, announcements and applicants — as one JSON file.
  // (Private DMs between other members are NOT included: the backup only
  // holds what the Main Admin can already see in the portal.)
  async function downloadBackup() {
    var btn = $("backupBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
    var members = await client.rpc("list_members_full");
    var messages = await client.from("messages").select("*").order("created_at", { ascending: false }).limit(1000);
    var apps = await client.from("applications").select("*").order("created_at", { ascending: false }).limit(500);
    if (btn) { btn.disabled = false; btn.textContent = "Download full club backup"; }
    if (members.error || messages.error || apps.error) {
      alert("Could not build the backup: " + ((members.error || messages.error || apps.error).message));
      return;
    }
    downloadFile("reva-fashion-club-backup-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify({ exported_at: new Date().toISOString(), exported_by: me.login_id,
        members: members.data || [], messages: messages.data || [], applications: apps.data || [] }, null, 2),
      "application/json;charset=utf-8");
  }

  // Main Admin only: lockdown mode — when on, nobody except the Main
  // Admin can sign in (the login page and the portal both enforce it).
  async function refreshLockdown() {
    var res = await client.rpc("get_lockdown");
    if (!res.error) lockdownOn = res.data === true;
    var st = $("lockdownStatus");
    if (st) st.textContent = lockdownOn ? "ON — only you can sign in right now." : "Off — everyone can sign in.";
    var btn = $("lockdownBtn");
    if (btn) btn.textContent = lockdownOn ? "Turn lockdown off" : "Turn lockdown on";
  }
  async function toggleLockdown() {
    var next = !lockdownOn;
    if (!window.confirm(next
      ? "Turn lockdown ON? Nobody except you will be able to sign in — everyone else will be signed out."
      : "Turn lockdown OFF? Everyone will be able to sign in again.")) return;
    var res = await client.rpc("set_lockdown", { p_locked: next });
    if (res.error) { alert("Could not change lockdown: " + res.error.message); return; }
    await refreshLockdown();
  }

  // Main Admin only: the audit log — who created, changed or removed
  // accounts. Only records events from the day the audit table was made.
  async function refreshAuditLog() {
    var res = await client.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100);
    if (res.error) { $("auditList").innerHTML = '<p class="empty">Could not load the audit log: ' + esc(res.error.message) + "</p>"; return; }
    var rows = res.data || [];
    auditRows = rows;
    if (!rows.length) { $("auditList").innerHTML = '<p class="empty">No account changes recorded yet. The log starts from the day it was switched on.</p>'; return; }
    $("auditList").innerHTML = rows.map(function (r) {
      return '<div class="row-item"><div class="avatar" aria-hidden="true">' + esc(initials(r.actor_name || "?")) + "</div>" +
        '<div class="body"><b>' + esc(r.actor_name || "SQL Editor") + "</b> " +
        '<span class="chip ghost">' + esc(r.action) + "</span>" +
        '<div class="meta">' + esc(timeAgo(r.created_at)) + (r.target_name ? " &middot; " + esc(r.target_name) + (r.target_login_id ? " (" + esc(r.target_login_id) + ")" : "") : "") + "</div>" +
        (r.details ? "<p>" + esc(r.details) + "</p>" : "") + "</div></div>";
    }).join("");
  }

  // Main Admin only: download the audit log as a CSV file.
  function downloadAuditCsv() {
    var head = ["When", "Who", "Action", "Member", "Login ID", "Details"];
    function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    var lines = (auditRows || []).map(function (r) {
      return [r.created_at, r.actor_name || "SQL Editor", r.action, r.target_name || "", r.target_login_id || "", r.details || ""].map(q).join(",");
    });
    downloadFile("reva-fashion-club-audit-log-" + new Date().toISOString().slice(0, 10) + ".csv",
      head.map(q).join(",") + "\n" + lines.join("\n"), "text/csv;charset=utf-8");
  }

  // Main Admin only: one box on the dashboard with everything that
  // needs the Main Admin's attention right now.
  async function refreshNeedsAttention() {
    var box = $("needsAttentionList");
    if (!box) return;
    var apps = await client.from("applications").select("id", { count: "exact", head: true }).eq("status", "new");
    var newApps = (!apps.error && typeof apps.count === "number") ? apps.count : 0;
    var reps = await client.from("messages").select("id", { count: "exact", head: true }).eq("kind", "report").eq("is_read", false);
    var unreadReports = (!reps.error && typeof reps.count === "number") ? reps.count : 0;
    var suspended = adminRows.filter(function (p) { return p.is_suspended; }).length;
    var neverSignedIn = adminRows.filter(function (p) { return !lastSignins[p.id]; }).length;
    var items = [];
    if (newApps) items.push({ n: newApps, label: newApps === 1 ? "new applicant" : "new applicants", tab: "applicants" });
    if (unreadReports) items.push({ n: unreadReports, label: unreadReports === 1 ? "unread report to Admin" : "unread reports to Admin", tab: "messages" });
    if (suspended) items.push({ n: suspended, label: suspended === 1 ? "suspended member" : "suspended members", tab: "admin" });
    if (neverSignedIn) items.push({ n: neverSignedIn, label: neverSignedIn === 1 ? "member never signed in" : "members never signed in", tab: "admin" });
    if (!items.length) {
      box.innerHTML = '<p class="empty" style="padding:4px">Nothing needs your attention right now.</p>';
      return;
    }
    box.innerHTML = items.map(function (it) {
      return '<div class="row-item" style="cursor:pointer" data-goto-tab="' + it.tab + '">' +
        '<div class="body"><b>' + it.n + " " + esc(it.label) + '</b><div class="meta">Tap to open</div></div></div>';
    }).join("");
    box.querySelectorAll("[data-goto-tab]").forEach(function (el) {
      el.addEventListener("click", function () {
        document.querySelector('nav.tabs button[data-tab="' + el.getAttribute("data-goto-tab") + '"]').click();
      });
    });
  }

  // Main Admin only: the latest club activity in one timeline — new
  // members, new applicants, new announcements, and account changes.
  async function refreshActivityFeed() {
    var box = $("activityFeedList");
    if (!box) return;
    var items = [];
    (auditRows || []).slice(0, 5).forEach(function (r) {
      items.push({ t: r.created_at, html: "<b>" + esc(r.actor_name || "SQL Editor") + "</b> " + esc(r.action) + (r.target_name ? " — " + esc(r.target_name) : "") });
    });
    (applicantsRows || []).slice(0, 5).forEach(function (a) {
      items.push({ t: a.created_at, html: "New application from <b>" + esc(a.name) + "</b> (" + esc(a.vertical || "") + ")" });
    });
    (annRows || []).slice(0, 5).forEach(function (a) {
      var sender = directoryById[a.sender_id];
      items.push({ t: a.created_at, html: "Announcement by <b>" + esc(sender ? sender.name : "Club") + "</b>" });
    });
    (adminRows || []).slice().sort(function (x, y) { return new Date(y.created_at) - new Date(x.created_at); }).slice(0, 5).forEach(function (p) {
      items.push({ t: p.created_at, html: "<b>" + esc(p.name) + "</b> joined as " + esc(ROLE_LABELS[p.role] || p.role) });
    });
    items.sort(function (x, y) { return new Date(y.t) - new Date(x.t); });
    items = items.slice(0, 12);
    if (!items.length) { box.innerHTML = '<p class="empty" style="padding:4px">No activity yet.</p>'; return; }
    box.innerHTML = items.map(function (it) {
      return '<div class="meta" style="margin-bottom:8px">' + esc(timeAgo(it.t)) + " — " + it.html + "</div>";
    }).join("");
  }

  async function refreshAdminList() {
    var res = await client.rpc("list_members_full");
    if (res.error) { $("adminList").innerHTML = '<p class="empty">Could not load accounts: ' + esc(res.error.message) + "</p>"; return; }
    var rows = res.data || [];
    adminRows = rows;
    // Main Admin only: when each member last signed in.
    if (isMainAdmin()) {
      var ls = await client.rpc("list_last_signins");
      lastSignins = {};
      if (!ls.error && ls.data) ls.data.forEach(function (r) { lastSignins[r.id] = r.last_sign_in_at; });
    }
    if (!rows.length) { $("adminList").innerHTML = '<p class="empty">No accounts yet.</p>'; return; }
    $("adminList").innerHTML = rows.map(function (p) {
      var viewerIsMain = isMainAdmin();
      var viewerIsSecond = isSecondAdmin();
      // Who may change this row's role: the Main Admin may change any
      // role except his own; a Second Admin may change anyone except
      // Main Admins and Second Admins (only the Main Admin touches
      // admin-door accounts).
      var canChangeRole = viewerIsMain ? p.role !== "admin"
        : viewerIsSecond ? (p.door !== "admin")
        : false;
      var canRemove = p.role !== "admin" && (p.door !== "admin" || viewerIsMain);
      var opts = ALL_ROLES.filter(function (r) { return viewerIsMain || r !== "admin"; }).map(function (r) {
        return '<option value="' + r + '"' + (p.role === r ? " selected" : "") + ">" + ROLE_LABELS[r] + "</option>";
      }).join("");
      var rowNote = p.role === "admin"
        ? '<span class="muted">Main Admin — this account cannot be removed, and its role cannot be changed.</span>'
        : (p.door === "admin" && !viewerIsMain)
        ? '<span class="muted">Only the Main Admin can change or remove an Admin-door account.</span>'
        : "";
      return '<div class="row-item">' +
        avatarHtml(p) +
        '<div class="body"><b>' + esc(p.name) + "</b> " +
        '<span class="chip' + (p.role === "admin" || p.role === "second_admin" ? " orange" : "") + '">' + esc(ROLE_LABELS[p.role] || p.role) + "</span> " +
        (p.email_verified ? '<span class="chip ghost">Email verified</span>' : '<span class="chip ghost">Email not verified</span>') +
        (p.is_suspended ? ' <span class="chip orange">Suspended</span>' : "") +
        '<div class="meta">' + (viewerIsMain || p.id === me.id ? "Login ID: " + esc(p.login_id) + " &middot; " : "") + esc(DOOR_LABELS[p.door]) + " door &middot; Added by " +
        (p.added_by_role === "admin" ? "Admin" : esc(p.added_by) + " (" + esc(ROLE_LABELS[p.added_by_role] || p.added_by_role) + ")") +
        " &middot; " + esc(timeAgo(p.created_at)) + "</div>" +
        '<div class="contact-line">Email: ' + esc(p.email || "—") + "  •  Mobile: " + esc(p.mobile || "—") + "</div>" +
        (p.is_suspended && p.suspended_reason ? '<div class="meta">Suspended: ' + esc(p.suspended_reason) + "</div>" : "") +
        (viewerIsMain && p.admin_notes ? '<div class="meta">Note: ' + esc(p.admin_notes) + "</div>" : "") +
        (viewerIsMain ? '<div class="meta">Last sign-in: ' + esc(lastSigninText(p.id)) + "</div>" : "") +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">' +
        (viewerIsMain || viewerIsSecond ? '<input type="checkbox" data-bulk="' + esc(p.id) + '" aria-label="Select ' + esc(p.name) + '" style="width:auto;margin:0"' + (bulkSelected.indexOf(p.id) !== -1 ? " checked" : "") + " />" : "") +
        '<button class="btn ghost small" type="button" data-profile="' + esc(p.id) + '">View profile</button>' +
        '<label style="margin:0" for="role-' + esc(p.id) + '">Role</label>' +
        '<select id="role-' + esc(p.id) + '" data-role-for="' + esc(p.id) + '" style="width:auto;margin:0"' + (canChangeRole ? "" : " disabled") + '>' + opts + "</select>" +
        rowNote +
        (canRemove ? '<button class="btn ghost small" type="button" data-remove="' + esc(p.id) + '" data-remove-name="' + esc(p.name) + '">Remove account</button>' : "") +
        (viewerIsMain && p.role !== "admin" ? '<button class="btn ghost small" type="button" data-suspend="' + esc(p.id) + '" data-suspend-name="' + esc(p.name) + '" data-suspend-now="' + (p.is_suspended ? "0" : "1") + '">' + (p.is_suspended ? "Unsuspend" : "Suspend") + "</button>" : "") +
        (viewerIsMain ? '<button class="btn ghost small" type="button" data-resetpw="' + esc(p.email || "") + '">Reset password</button>' : "") +
        "</div></div></div>";
    }).join("") + '<p class="muted" style="margin-top:14px">Removing an account deletes its portal profile. Also delete the same user in Supabase Dashboard → Authentication → Users, otherwise the email stays registered and cannot be used for a new account.</p>';
    document.querySelectorAll("[data-role-for]").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        var id = sel.getAttribute("data-role-for");
        var res = await client.from("profiles").update({ role: sel.value }).eq("id", id);
        if (res.error) {
          alert("Could not change the role: " + res.error.message);
          await refreshAdminList();
          return;
        }
        await refreshDirectory();
        await refreshAdminList();
      });
    });
    document.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-remove");
        var name = btn.getAttribute("data-remove-name");
        if (!window.confirm("Remove " + name + " from the club? Their portal profile will be deleted.")) return;
        var res = await client.from("profiles").delete().eq("id", id);
        if (res.error) { alert("Could not remove the account: " + res.error.message); return; }
        await refreshDirectory();
        await refreshDashboard();
        await refreshAdminList();
      });
    });
    // Main Admin only: suspend / unsuspend (with a reason when
    // suspending — the member sees it when they try to sign in),
    // and send a password-reset email.
    document.querySelectorAll("[data-suspend]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-suspend");
        var name = btn.getAttribute("data-suspend-name");
        var suspending = btn.getAttribute("data-suspend-now") === "1";
        var reason = null;
        if (suspending) {
          reason = window.prompt("Reason for suspending " + name + "? (optional — the member sees this when they try to sign in)");
          if (reason === null) return;
        } else if (!window.confirm("Unsuspend " + name + "? They will be able to sign in again.")) return;
        var res = await client.rpc("set_member_suspended", { p_id: id, p_suspended: suspending, p_reason: reason });
        if (res.error) { alert("Could not update: " + res.error.message); return; }
        await refreshDirectory();
        await refreshAdminList();
      });
    });
    document.querySelectorAll("[data-resetpw]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var email = btn.getAttribute("data-resetpw");
        if (!email) { alert("No email on this account."); return; }
        if (!window.confirm("Send a password-reset email to " + email + "? They will set a new password from the link.")) return;
        btn.disabled = true; btn.textContent = "Sending…";
        var res = await client.auth.resetPasswordForEmail(email, { redirectTo: portalLoginUrl() });
        btn.disabled = false; btn.textContent = "Reset password";
        if (res.error) { alert("Could not send the reset email: " + res.error.message); return; }
        btn.textContent = "Reset email sent";
      });
    });
    document.querySelectorAll("[data-profile]").forEach(function (btn) {
      btn.addEventListener("click", function () { openProfile(btn.getAttribute("data-profile")); });
    });
    document.querySelectorAll("[data-bulk]").forEach(function (cb) {
      cb.checked = bulkSelected.indexOf(cb.getAttribute("data-bulk")) !== -1;
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-bulk");
        if (cb.checked && bulkSelected.indexOf(id) === -1) bulkSelected.push(id);
        if (!cb.checked) bulkSelected = bulkSelected.filter(function (x) { return x !== id; });
        updateBulkBar();
        fillDmRecipients();
      });
    });
    if (isMainAdmin()) await renderAnalytics(rows);
  }

  function lastSigninText(id) {
    var v = lastSignins[id];
    return v ? timeAgo(v) : "Never signed in";
  }

  // Main Admin only: club numbers at a glance, from the admin list.
  async function renderAnalytics(rows) {
    var box = $("analyticsGrid");
    if (!box) return;
    var total = rows.length;
    var suspended = rows.filter(function (p) { return p.is_suspended; }).length;
    var monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    var monthIso = monthStart.toISOString();
    var joinedMonth = rows.filter(function (p) { return new Date(p.created_at) >= monthStart; }).length;
    var byRole = {};
    rows.forEach(function (p) { byRole[p.role] = (byRole[p.role] || 0) + 1; });
    var roleLines = Object.keys(byRole).sort(function (a, b) { return byRole[b] - byRole[a]; }).map(function (r) {
      return "<div>" + esc(ROLE_LABELS[r] || r) + ": <b>" + byRole[r] + "</b></div>";
    }).join("");
    var appCount = null;
    var apps = await client.from("applications").select("id", { count: "exact", head: true }).eq("status", "new");
    if (!apps.error && typeof apps.count === "number") appCount = apps.count;
    var annMonth = null;
    var anns = await client.from("messages").select("id", { count: "exact", head: true }).eq("kind", "announcement").gte("created_at", monthIso);
    if (!anns.error && typeof anns.count === "number") annMonth = anns.count;
    var appsMonth = null;
    var appM = await client.from("applications").select("id", { count: "exact", head: true }).gte("created_at", monthIso);
    if (!appM.error && typeof appM.count === "number") appsMonth = appM.count;
    var converted = null;
    var conv = await client.from("applications").select("id", { count: "exact", head: true }).not("converted_to", "is", null);
    if (!conv.error && typeof conv.count === "number") converted = conv.count;
    box.innerHTML =
      '<div class="stat-grid">' +
      '<div class="stat"><b>' + total + '</b><span>Total members</span></div>' +
      '<div class="stat"><b>' + joinedMonth + '</b><span>Joined this month</span></div>' +
      '<div class="stat"><b>' + (appCount === null ? "–" : appCount) + '</b><span>New applicants</span></div>' +
      '<div class="stat"><b>' + suspended + '</b><span>Suspended</span></div>' +
      '<div class="stat"><b>' + (annMonth === null ? "–" : annMonth) + '</b><span>Announcements this month</span></div>' +
      '<div class="stat"><b>' + (appsMonth === null ? "–" : appsMonth) + '</b><span>Applicants this month</span></div>' +
      '<div class="stat"><b>' + (converted === null ? "–" : converted) + '</b><span>Applicants converted</span></div>' +
      "</div>" +
      '<div class="muted" style="margin-top:10px">' + roleLines + "</div>";
  }

  /* ---------------- club roles (Main Admin only) ---------------- */
  // Create, edit and delete custom club roles, and see every role's
  // permissions at a glance. The 13 built-in roles cannot be edited or
  // deleted — their permissions are the club's settled rules. A custom
  // role only ever gets the 8 permission switches; the Admin panel
  // powers (suspend, lockdown, audit log, backup) stay with the two
  // admin levels.
  function setupRoles() {
    if (!isMainAdmin()) return;
    $("roleCode").addEventListener("input", function () {
      var clean = $("roleCode").value.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean !== $("roleCode").value) $("roleCode").value = clean;
    });
    $("roleSaveBtn").addEventListener("click", saveRole);
    var cancelBtn = $("roleCancelBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", resetRoleForm);
  }

  async function refreshRoles() {
    await loadRoles();
    var list = $("rolesList");
    if (!list) return;
    if (!clubRoles.length) { list.innerHTML = '<p class="empty">No roles found.</p>'; return; }
    list.innerHTML = clubRoles.map(function (r) {
      var count = directory.filter(function (p) { return p.role === r.code; }).length;
      var perms = ROLE_PERMS.filter(function (pm) { return r[pm.key]; }).map(function (pm) { return pm.short; });
      return '<div class="row-item">' +
        '<div class="body"><b>' + esc(r.label) + "</b> " +
        '<span class="chip' + (r.door === "admin" ? " orange" : r.door === "official" ? "" : " ghost") + '">' + esc(DOOR_LABELS[r.door]) + " door</span> " +
        '<span class="chip ghost">' + (r.is_builtin ? "Built-in" : "Custom") + "</span>" +
        '<div class="meta">Code: ' + esc(r.code) + " &middot; " + count + (count === 1 ? " member" : " members") + "</div>" +
        '<div class="meta">' + (perms.length ? esc(perms.join(" · ")) : "No permissions") + "</div>" +
        "</div>" +
        (!r.is_builtin ? '<div class="actions">' +
          '<button class="btn ghost small" type="button" data-role-edit="' + esc(r.code) + '">Edit</button>' +
          (count === 0 ? '<button class="btn ghost small" type="button" data-role-delete="' + esc(r.code) + '" data-role-label="' + esc(r.label) + '">Delete</button>' : "") +
          "</div>" : "") +
        "</div>";
    }).join("");
    document.querySelectorAll("[data-role-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () { editRole(btn.getAttribute("data-role-edit")); });
    });
    document.querySelectorAll("[data-role-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var code = btn.getAttribute("data-role-delete");
        if (!window.confirm("Delete the role “" + btn.getAttribute("data-role-label") + "”? It can only be deleted when nobody holds it.")) return;
        var res = await client.from("club_roles").delete().eq("code", code);
        if (res.error) { alert("Could not delete the role: " + res.error.message); return; }
        await refreshRoles();
        renderDirectory();
        fillCreateRoleOptions();
        if (isAdmin()) await refreshAdminList();
      });
    });
    // Permissions chart: every role against every permission.
    var chart = $("permsChart");
    if (chart) {
      chart.innerHTML =
        '<div style="overflow-x:auto"><table class="perms"><thead><tr><th>Role</th>' +
        ROLE_PERMS.map(function (pm) { return "<th>" + esc(pm.short) + "</th>"; }).join("") +
        "</tr></thead><tbody>" +
        clubRoles.map(function (r) {
          return "<tr><td><b>" + esc(r.label) + "</b></td>" +
            ROLE_PERMS.map(function (pm) { return "<td>" + (r[pm.key] ? "✓" : "—") + "</td>"; }).join("") +
            "</tr>";
        }).join("") +
        "</tbody></table></div>";
    }
  }

  function editRole(code) {
    var r = roleRow(code);
    if (!r || r.is_builtin) return;
    editingRoleCode = code;
    $("roleCode").value = r.code;
    $("roleCode").disabled = true;
    $("roleLabel").value = r.label;
    $("roleDoor").value = r.door;
    ROLE_PERMS.forEach(function (pm) {
      var cb = $("perm-" + pm.key);
      if (cb) cb.checked = !!r[pm.key];
    });
    $("roleSaveBtn").textContent = "Save changes";
    $("roleCancelBtn").hidden = false;
    hideMsg($("roleMsg"));
    $("roleForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function resetRoleForm() {
    editingRoleCode = null;
    $("roleCode").value = "";
    $("roleCode").disabled = false;
    $("roleLabel").value = "";
    $("roleDoor").value = "official";
    ROLE_PERMS.forEach(function (pm) {
      var cb = $("perm-" + pm.key);
      if (cb) cb.checked = false;
    });
    $("roleSaveBtn").textContent = "Create role";
    $("roleCancelBtn").hidden = true;
    hideMsg($("roleMsg"));
  }

  async function saveRole() {
    var msg = $("roleMsg");
    var code = $("roleCode").value.trim().toLowerCase();
    var label = $("roleLabel").value.trim();
    var door = $("roleDoor").value;
    if (!code) { showMsg(msg, "Give the role a code (small letters, numbers and _ only)."); return; }
    if (!/^[a-z0-9_]+$/.test(code)) { showMsg(msg, "The code can only have small letters, numbers and _."); return; }
    if (!label) { showMsg(msg, "Give the role a display name."); return; }
    var row = { code: code, label: label, door: door, is_builtin: false };
    ROLE_PERMS.forEach(function (pm) {
      var cb = $("perm-" + pm.key);
      row[pm.key] = !!(cb && cb.checked);
    });
    var res;
    if (editingRoleCode) {
      res = await client.from("club_roles").update(row).eq("code", editingRoleCode);
    } else {
      res = await client.from("club_roles").insert(row);
    }
    if (res.error) { showMsg(msg, "Could not save the role: " + res.error.message); return; }
    var wasEditing = editingRoleCode;
    resetRoleForm();
    showMsg(msg, wasEditing ? "Role updated." : "Role created — it now appears in the create-account form.", "ok");
    await refreshRoles();
    renderDirectory();
    fillCreateRoleOptions();
    if (isAdmin()) await refreshAdminList();
  }

  /* ---------------- settings ---------------- */
  function setupSettings() {
    $("passForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg($("passMsg"));
      var p1 = $("newPass").value, p2 = $("newPass2").value;
      if (p1.length < 6) { showMsg($("passMsg"), "Choose a password of at least 6 characters."); return; }
      if (p1 !== p2) { showMsg($("passMsg"), "The two passwords do not match."); return; }
      $("passBtn").disabled = true;
      var res = await client.auth.updateUser({ password: p1 });
      $("passBtn").disabled = false;
      if (res.error) { showMsg($("passMsg"), "Could not change the password: " + res.error.message); return; }
      $("newPass").value = ""; $("newPass2").value = "";
      showMsg($("passMsg"), "Password changed.", "ok");
    });

    // My own mobile number. This changes the contact number only — it
    // does NOT change the sign-in password.
    var myMobileNow = $("myMobileNow");
    if (myMobileNow) myMobileNow.textContent = me.mobile || "—";
    var myPhotoPreview = $("myPhotoPreview");
    if (myPhotoPreview) myPhotoPreview.innerHTML = avatarHtml(me);
    var myMobileBtn = $("myMobileSaveBtn");
    if (myMobileBtn) myMobileBtn.addEventListener("click", async function () {
      hideMsg($("myMobileMsg"));
      var mobile = $("myMobileInput").value.replace(/[^0-9]/g, "");
      if (mobile.length < 10) { showMsg($("myMobileMsg"), "Enter the full mobile number (at least 10 digits)."); return; }
      myMobileBtn.disabled = true;
      var res = await client.rpc("update_my_mobile", { p_mobile: mobile });
      myMobileBtn.disabled = false;
      if (res.error) { showMsg($("myMobileMsg"), "Could not update: " + res.error.message); return; }
      me.mobile = mobile;
      $("myMobileNow").textContent = mobile;
      $("myMobileInput").value = "";
      $("setContact").textContent = "Login ID: " + me.login_id + "  •  " + me.email + "  •  " + me.mobile;
      showMsg($("myMobileMsg"), "Mobile number updated.", "ok");
      await refreshDirectory();
    });

    // My profile photo (max 2 MB, image files only). It is stored in
    // the club's public "avatars" bucket, so the photo link is public.
    var myPhotoBtn = $("myPhotoUploadBtn");
    if (myPhotoBtn) myPhotoBtn.addEventListener("click", async function () {
      hideMsg($("myPhotoMsg"));
      var file = $("myPhotoFile").files[0];
      if (!file) { showMsg($("myPhotoMsg"), "Choose a photo first."); return; }
      if (!file.type || file.type.indexOf("image/") !== 0) { showMsg($("myPhotoMsg"), "Choose an image file (JPG, PNG or WebP)."); return; }
      if (file.size > 2 * 1024 * 1024) { showMsg($("myPhotoMsg"), "That photo is over 2 MB — pick a smaller one."); return; }
      var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      var path = me.id + "/avatar." + ext;
      myPhotoBtn.disabled = true;
      var up = await client.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) {
        myPhotoBtn.disabled = false;
        showMsg($("myPhotoMsg"), "Could not upload: " + up.error.message);
        return;
      }
      var pub = client.storage.from("avatars").getPublicUrl(path);
      var url = pub.data ? pub.data.publicUrl : null;
      if (!url) {
        myPhotoBtn.disabled = false;
        showMsg($("myPhotoMsg"), "Upload worked but the photo link could not be read. Try again.");
        return;
      }
      var res = await client.rpc("set_my_avatar", { p_url: url });
      myPhotoBtn.disabled = false;
      if (res.error) { showMsg($("myPhotoMsg"), "Could not save the photo: " + res.error.message); return; }
      me.avatar_url = url;
      $("myPhotoPreview").innerHTML = avatarHtml(me);
      $("myPhotoFile").value = "";
      showMsg($("myPhotoMsg"), "Photo updated.", "ok");
      await refreshDirectory();
    });
    var myPhotoRemove = $("myPhotoRemoveBtn");
    if (myPhotoRemove) myPhotoRemove.addEventListener("click", async function () {
      hideMsg($("myPhotoMsg"));
      var res = await client.rpc("set_my_avatar", { p_url: null });
      if (res.error) { showMsg($("myPhotoMsg"), "Could not remove the photo: " + res.error.message); return; }
      me.avatar_url = null;
      $("myPhotoPreview").innerHTML = avatarHtml(me);
      showMsg($("myPhotoMsg"), "Photo removed.", "ok");
      await refreshDirectory();
    });
  }

  setupOtp();
  boot();
})();
