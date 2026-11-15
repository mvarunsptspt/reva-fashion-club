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
    official: "Official",
    admin: "Admin"
  };
  var DOOR_LABELS = { member: "Member", official: "Official", admin: "Admin" };
  var OFFICE_ROLES = ["president", "vice_president", "official", "admin"];
  var ALL_ROLES = ["member", "core_member", "president", "vice_president", "official", "admin"];

  var me = null;          // my profile row
  var directory = [];     // public member list (list_members)
  var directoryById = {};
  var otpSentForMe = false;

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
  function isAdmin() { return me && me.role === "admin"; }
  function isPrivileged() { return me && (me.role === "admin" || me.role === "president" || me.role === "vice_president"); }
  function isOfficialOrAbove() { return me && (me.role !== "member" && me.role !== "core_member"); }
  function canCreate() { return isAdmin() || (me && (me.role === "president" || me.role === "vice_president" || me.role === "official")); }
  function canPostAnnouncement() { return isOfficialOrAbove(); }

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
    renderIdentity();
    setupTabs();
    setupCreateForm();
    setupMessages();
    setupAnnouncements();
    setupAdmin();
    setupSettings();
    await refreshDirectory();
    await refreshDashboard();
    await refreshInbox();
    await refreshAnnouncements();
    if (isAdmin()) await refreshAdminList();
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
    if (!canPostAnnouncement()) $("announcePostCard").hidden = true;
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

  function renderDirectory() {
    if (!directory.length) { $("memberList").innerHTML = '<p class="empty">No members yet.</p>'; return; }
    $("memberList").innerHTML = directory.map(function (p) {
      var self = p.id === me.id;
      return '<div class="row-item">' +
        '<div class="avatar" aria-hidden="true">' + esc(initials(p.name)) + "</div>" +
        '<div class="body"><b>' + esc(p.name) + "</b> " +
        '<span class="chip' + (p.role === "admin" ? " orange" : p.role === "president" || p.role === "vice_president" ? "" : " ghost") + '">' + esc(ROLE_LABELS[p.role] || p.role) + "</span>" +
        '<div class="meta">Login ID: ' + esc(p.login_id) + " &middot; " + esc(DOOR_LABELS[p.door]) + " door" + (self ? " &middot; This is you" : "") + "</div>" +
        '<div class="contact-line" id="contact-' + esc(p.id) + '"></div>' +
        "</div>" +
        '<div class="actions"><button class="btn ghost small" type="button" data-contact="' + esc(p.id) + '">' +
        (self ? "My contact" : "Show contact") + "</button></div>" +
        "</div>";
    }).join("");
    document.querySelectorAll("[data-contact]").forEach(function (btn) {
      btn.addEventListener("click", function () { revealContact(btn.getAttribute("data-contact"), btn); });
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
      box.textContent = "Email: " + c.email + "  •  Mobile: " + c.mobile;
    }
    btn.onclick = function () { box.textContent = ""; btn.textContent = "Show contact"; btn.onclick = null; };
  }

  function fillDmRecipients() {
    var sel = $("dmTo");
    sel.innerHTML = directory
      .filter(function (p) { return p.id !== me.id; })
      .map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name) + " — " + esc(ROLE_LABELS[p.role] || p.role) + "</option>";
      }).join("");
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
    var feed = await client.from("messages").select("*").eq("kind", "announcement").order("created_at", { ascending: false }).limit(5);
    if (feed.error) { $("dashAnnouncements").innerHTML = '<p class="empty">Could not load announcements.</p>'; return; }
    if (!feed.data.length) { $("dashAnnouncements").innerHTML = '<p class="empty">No announcements yet.</p>'; return; }
    $("dashAnnouncements").innerHTML = feed.data.map(function (a) { return announcementHtml(a); }).join("");
  }

  function announcementHtml(a) {
    var sender = directoryById[a.sender_id];
    return '<div class="row-item">' +
      '<div class="avatar" aria-hidden="true">' + esc(initials(sender ? sender.name : "?")) + "</div>" +
      '<div class="body"><b>' + esc(sender ? sender.name : "Club") + "</b> " +
      '<span class="chip ghost">' + esc(a.audience === "everyone" ? "Everyone" : a.audience === "officials" ? "Officials only" : "Members only") + "</span>" +
      '<div class="meta">' + esc(timeAgo(a.created_at)) + "</div>" +
      "<p>" + esc(a.body) + "</p></div></div>";
  }

  /* ---------------- messages ---------------- */
  function setupMessages() {
    $("dmForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg($("dmMsg"));
      var to = $("dmTo").value, subject = $("dmSubject").value.trim(), body = $("dmBody").value.trim();
      if (!to) { showMsg($("dmMsg"), "Choose who to message."); return; }
      if (!body) { showMsg($("dmMsg"), "Write a message first."); return; }
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
    var items = (res.data || []).filter(function (m) {
      if (m.kind === "report") return isAdmin() || m.sender_id === me.id;
      return m.recipient_id === me.id || m.sender_id === me.id;
    });
    if (!items.length) { $("inboxList").innerHTML = '<p class="empty">No messages yet. Your welcome message and any reports will appear here.</p>'; return; }
    $("inboxList").innerHTML = items.map(function (m) {
      var sender = directoryById[m.sender_id];
      var toMe = m.recipient_id === me.id;
      var unread = toMe && !m.is_read;
      var label = m.kind === "report"
        ? "Report to Admin — " + esc(m.subject || "Report")
        : (m.sender_id === me.id ? "To " + esc((directoryById[m.recipient_id] || {}).name || "…") : "From " + esc(sender ? sender.name : "…"));
      return '<div class="row-item' + (unread ? " unread" : "") + '">' +
        '<div class="avatar" aria-hidden="true">' + esc(initials(sender ? sender.name : "?")) + "</div>" +
        '<div class="body"><b>' + label + "</b> " + (unread ? '<span class="chip orange">Unread</span>' : "") +
        '<div class="meta">' + esc(timeAgo(m.created_at)) + (m.subject && m.kind === "dm" ? " &middot; " + esc(m.subject) : "") + "</div>" +
        "<p>" + esc(m.body) + "</p></div>" +
        (unread ? '<div class="actions"><button class="btn ghost small" type="button" data-read="' + esc(m.id) + '">Mark read</button></div>' : "") +
        "</div>";
    }).join("");
    document.querySelectorAll("[data-read]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        await client.from("messages").update({ is_read: true }).eq("id", btn.getAttribute("data-read"));
        await refreshInbox();
        await refreshDashboard();
      });
    });
  }

  /* ---------------- announcements ---------------- */
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
  }

  async function refreshAnnouncements() {
    var res = await client.from("messages").select("*").eq("kind", "announcement").order("created_at", { ascending: false }).limit(30);
    if (res.error) { $("announceList").innerHTML = '<p class="empty">Could not load announcements.</p>'; return; }
    if (!res.data.length) { $("announceList").innerHTML = '<p class="empty">No announcements yet.</p>'; return; }
    $("announceList").innerHTML = res.data.map(function (a) { return announcementHtml(a); }).join("");
  }

  /* ---------------- email OTP (my own account) ---------------- */
  async function sendOtpToMe() {
    if (otpSentForMe) return;
    otpSentForMe = true;
    var res = await client.auth.signInWithOtp({ email: me.email, options: { shouldCreateUser: false } });
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

  function setupCreateForm() {
    if (!canCreate()) return;
    var roleSel = $("cRole");
    var roles = isAdmin() ? ALL_ROLES : ["member", "core_member"];
    roleSel.innerHTML = roles.map(function (r) {
      return '<option value="' + r + '">' + ROLE_LABELS[r] + "</option>";
    }).join("");
    $("roleHint").textContent = isAdmin()
      ? "Admin: you can assign any role, including offices."
      : "Officials can only create Member / Core Member accounts. Offices are assigned by the Admin.";

    // Login ID rule: letters and numbers only — strip spaces and symbols as typed.
    $("cLoginId").addEventListener("input", function () {
      var clean = $("cLoginId").value.replace(/[^A-Za-z0-9]/g, "");
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
      var loginId = $("cLoginId").value.trim();
      var email = $("cEmail").value.trim().toLowerCase();
      var mobile = $("cMobile").value.trim();
      if (!name) { showMsg($("createMsg"), "Enter the member's full name."); return; }
      if (!loginId) { showMsg($("createMsg"), "Enter a login ID (letters and numbers only, no spaces)."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg($("createMsg"), "Enter a valid email address."); return; }
      if (mobile.length < 10) { showMsg($("createMsg"), "Enter the full mobile number (at least 10 digits)."); return; }
      if (!isAdmin() && OFFICE_ROLES.indexOf(role) !== -1) {
        showMsg($("createMsg"), "Only the Admin can assign offices. Choose Member or Core Member.");
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

        newAccount = { id: newUserId, email: email };
        showMsg($("createMsg"),
          "Account created for " + name + " (" + ROLE_LABELS[role] + "). Login ID: " + loginId +
          ". Temporary password: the mobile number. Tell the member to sign in through the " +
          DOOR_LABELS[role === "admin" ? "admin" : (role === "member" || role === "core_member" ? "member" : "official")] +
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
    var res = await iso.auth.signInWithOtp({ email: newAccount.email, options: { shouldCreateUser: false } });
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
    var door = role === "admin" ? "admin" : (role === "member" || role === "core_member" ? "member" : "official");
    $("pvDoor").innerHTML = "Signs in through the <b>" + DOOR_LABELS[door] + " Login</b> door.";
    var title = document.querySelector("#tab-create h1.page");
    if (title) title.innerHTML = "Create a <em>" + esc(ROLE_LABELS[role] || "Member") + " account</em>";
    updateCreateBtn();
  }

  /* ---------------- admin panel ---------------- */
  function setupAdmin() {
    if (!isAdmin()) return;
  }

  async function refreshAdminList() {
    var res = await client.rpc("list_members_full");
    if (res.error) { $("adminList").innerHTML = '<p class="empty">Could not load accounts: ' + esc(res.error.message) + "</p>"; return; }
    var rows = res.data || [];
    if (!rows.length) { $("adminList").innerHTML = '<p class="empty">No accounts yet.</p>'; return; }
    $("adminList").innerHTML = rows.map(function (p) {
      var opts = ALL_ROLES.map(function (r) {
        return '<option value="' + r + '"' + (p.role === r ? " selected" : "") + ">" + ROLE_LABELS[r] + "</option>";
      }).join("");
      return '<div class="row-item">' +
        '<div class="avatar" aria-hidden="true">' + esc(initials(p.name)) + "</div>" +
        '<div class="body"><b>' + esc(p.name) + "</b> " +
        '<span class="chip' + (p.role === "admin" ? " orange" : "") + '">' + esc(ROLE_LABELS[p.role] || p.role) + "</span> " +
        (p.email_verified ? '<span class="chip ghost">Email verified</span>' : '<span class="chip ghost">Email not verified</span>') +
        '<div class="meta">Login ID: ' + esc(p.login_id) + " &middot; " + esc(DOOR_LABELS[p.door]) + " door &middot; Added by " +
        (p.added_by_role === "admin" ? "Admin" : esc(p.added_by) + " (" + esc(ROLE_LABELS[p.added_by_role] || p.added_by_role) + ")") +
        " &middot; " + esc(timeAgo(p.created_at)) + "</div>" +
        '<div class="contact-line">Email: ' + esc(p.email || "—") + "  •  Mobile: " + esc(p.mobile || "—") + "</div>" +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">' +
        '<label style="margin:0" for="role-' + esc(p.id) + '">Role</label>' +
        '<select id="role-' + esc(p.id) + '" data-role-for="' + esc(p.id) + '" style="width:auto;margin:0">' + opts + "</select>" +
        (p.role === "admin"
          ? '<span class="muted">This is the Admin account.</span>'
          : '<button class="btn ghost small" type="button" data-remove="' + esc(p.id) + '" data-remove-name="' + esc(p.name) + '">Remove account</button>') +
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
  }

  setupOtp();
  boot();
})();
