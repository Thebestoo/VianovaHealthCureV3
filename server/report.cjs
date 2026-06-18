// report.js — loaded via createRequire (CJS)

/**
 * generateCasesReport(cases, meta)
 *
 * @param {Array}  cases  - Array of case objects from the DB
 * @param {Object} meta   - { generatedAt, totalCases, byStatus, byConfidence, doctorName? }
 * @returns {string}      - Complete HTML document string
 */
function generateCasesReport(cases, meta) {

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function categorize(complaint) {
    if (!complaint) return 'Uncategorized';
    const c = complaint.toLowerCase();
    if (/chest pain|angina|palpitation|cardiac|heart|myocard/.test(c))     return 'Cardiovascular';
    if (/breath|dyspnea|wheez|asthma|copd|pneumon|cough|lung/.test(c))    return 'Respiratory';
    if (/headache|migraine|neuro|seizure|stroke|dizz|syncope|vertigo/.test(c)) return 'Neurological';
    if (/abdomen|nausea|vomit|diarrhea|constipat|bowel|gastro|liver|hepat/.test(c)) return 'Gastrointestinal';
    if (/joint|arthri|bone|fracture|muscle|back pain|lumbar|orthop/.test(c)) return 'Musculoskeletal';
    if (/rash|skin|dermat|itch|urtic|eczema|psoria/.test(c))               return 'Dermatological';
    if (/diabet|thyroid|endocrin|hormone|insulin|glucose/.test(c))         return 'Endocrine';
    if (/infect|fever|sepsis|bacter|virus|covid|flu|malaria/.test(c))      return 'Infectious Disease';
    if (/anxiet|depress|psych|mental|panic|stress|bipolar|schizo/.test(c)) return 'Psychiatric';
    if (/urin|kidney|renal|bladder|prostate|nephro/.test(c))               return 'Urological';
    if (/eye|vision|ophth|glaucoma|cataract/.test(c))                      return 'Ophthalmological';
    if (/ear|hearing|ent|throat|sinus|nose/.test(c))                       return 'ENT';
    if (/pregnan|obstet|gynec|uterus|ovary|menstrual/.test(c))             return 'Obstetrics & Gynaecology';
    if (/child|pediatric|infant|neonate/.test(c))                          return 'Paediatrics';
    return 'General Medicine';
  }

  function esc(str) {
    if (str == null) return '—';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch { return String(dateStr); }
  }

  function fmtFull(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return String(dateStr); }
  }

  function statusBadge(status, approved) {
    const s = (status || '').toLowerCase();
    if (approved) return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">Approved</span>`;
    if (s === 'pending')   return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;border:1px solid #fcd34d">Pending</span>`;
    if (s === 'reviewed')  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#e0e7ff;color:#3730a3;border:1px solid #a5b4fc">Reviewed</span>`;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1">${esc(status)}</span>`;
  }

  function confidenceBadge(level) {
    const l = (level || '').toLowerCase();
    if (l === 'high')     return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">High</span>`;
    if (l === 'moderate') return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;border:1px solid #fcd34d">Moderate</span>`;
    if (l === 'low')      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5">Low</span>`;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1">${esc(level)}</span>`;
  }

  function emergencyBadge(val) {
    return val
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5">YES</span>`
      : `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f1f5f9;color:#6b7280;border:1px solid #e5e7eb">No</span>`;
  }

  function pct(n, total) {
    if (!total) return '0.0';
    return ((n / total) * 100).toFixed(1);
  }

  // ─── Derived statistics ──────────────────────────────────────────────────────

  const total = meta.totalCases || cases.length;

  // byStatus
  const approved    = (meta.byStatus && meta.byStatus.approved)   || cases.filter(c => c.approved).length;
  const pending     = (meta.byStatus && meta.byStatus.pending)     || cases.filter(c => (c.review_status || '').toLowerCase() === 'pending').length;
  const reviewed    = (meta.byStatus && meta.byStatus.reviewed)    || cases.filter(c => (c.review_status || '').toLowerCase() === 'reviewed' && !c.approved).length;
  const emergency   = cases.filter(c => c.emergency_detected).length;

  // byConfidence
  const confHigh    = (meta.byConfidence && meta.byConfidence.high)     || cases.filter(c => (c.confidence_level || '').toLowerCase() === 'high').length;
  const confMod     = (meta.byConfidence && meta.byConfidence.moderate)  || cases.filter(c => (c.confidence_level || '').toLowerCase() === 'moderate').length;
  const confLow     = (meta.byConfidence && meta.byConfidence.low)       || cases.filter(c => (c.confidence_level || '').toLowerCase() === 'low').length;

  // byCategory
  const catMap = {};
  cases.forEach(c => {
    const cat = categorize(c.presenting_complaint);
    catMap[cat] = (catMap[cat] || 0) + 1;
  });
  const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // ─── Summary table rows ──────────────────────────────────────────────────────

  const statusRows = [
    ['Approved',              approved, '#d1fae5', '#065f46'],
    ['Pending Review',        pending,  '#fef3c7', '#92400e'],
    ['Reviewed (Not Approved)', reviewed, '#e0e7ff', '#3730a3'],
  ].map(([label, count, bg, fg]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bg};border:2px solid ${fg};margin-right:8px;vertical-align:middle"></span>
        ${label}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600">${count}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${pct(count, total)}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">
        <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
          <div style="width:${pct(count, total)}%;background:${fg};height:8px;border-radius:4px"></div>
        </div>
      </td>
    </tr>`).join('');

  const confRows = [
    ['High',     confHigh, '#059669'],
    ['Moderate', confMod,  '#d97706'],
    ['Low',      confLow,  '#dc2626'],
  ].map(([label, count, color]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:8px;vertical-align:middle"></span>
        ${label}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600">${count}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${pct(count, total)}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">
        <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
          <div style="width:${pct(count, total)}%;background:${color};height:8px;border-radius:4px"></div>
        </div>
      </td>
    </tr>`).join('');

  const catRows = categories.map(([cat, count]) => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0">${esc(cat)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600">${count}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${pct(count, total)}%</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0">
        <div style="background:#e2e8f0;border-radius:4px;height:7px;overflow:hidden">
          <div style="width:${pct(count, total)}%;background:#0e7490;height:7px;border-radius:4px"></div>
        </div>
      </td>
    </tr>`).join('');

  // ─── Full cases table rows ───────────────────────────────────────────────────

  const caseTableRows = cases.map((c, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center">${i + 1}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;color:#0e7490">${esc(c.case_id)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${esc(c.age) || '?'}y / ${esc(c.sex) || '?'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569">${esc(categorize(c.presenting_complaint))}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;max-width:220px;font-size:12px">${esc(c.presenting_complaint)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${confidenceBadge(c.confidence_level)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${emergencyBadge(c.emergency_detected)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0">${statusBadge(c.review_status, c.approved)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569">${esc(c.reviewed_by)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;white-space:nowrap;color:#64748b">${fmt(c.created_at)}</td>
    </tr>`).join('');

  // ─── Detailed case cards ─────────────────────────────────────────────────────

  function renderDifferentials(diffs) {
    if (!diffs) return '<span style="color:#94a3b8;font-style:italic">No differentials recorded</span>';
    let list = diffs;
    if (typeof diffs === 'string') {
      try { list = JSON.parse(diffs); } catch { list = [diffs]; }
    }
    if (!Array.isArray(list)) list = Object.values(list);
    if (!list.length) return '<span style="color:#94a3b8;font-style:italic">No differentials recorded</span>';

    return list.map((d, idx) => {
      if (typeof d === 'string') {
        return `<div style="padding:8px 12px;margin-bottom:6px;background:#f0f9ff;border-left:3px solid #0e7490;border-radius:0 6px 6px 0;font-size:13px">${esc(d)}</div>`;
      }
      // object differential
      const name        = d.name || d.diagnosis || d.condition || 'Unknown';
      const probability = d.probability || d.likelihood || d.confidence || null;
      const reasoning   = d.reasoning || d.rationale || d.notes || null;
      const treatment   = d.treatment || d.management || d.plan || null;
      const notes       = d.doctor_notes || d.notes || null;
      const cure        = d.approved_cure || d.cure || d.final_diagnosis || null;

      return `
        <div style="margin-bottom:10px;border:1px solid #e0f2fe;border-radius:8px;overflow:hidden">
          <div style="padding:9px 14px;background:#f0f9ff;display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;color:#0c4a6e;font-size:13px">${idx + 1}. ${esc(name)}</span>
            ${probability ? `<span style="font-size:11px;font-weight:600;color:#0e7490;background:#e0f2fe;padding:2px 8px;border-radius:10px">${esc(String(probability))}</span>` : ''}
          </div>
          ${reasoning ? `<div style="padding:7px 14px;border-top:1px solid #e0f2fe;font-size:12px;color:#334155"><strong style="color:#0e7490">Reasoning:</strong> ${esc(reasoning)}</div>` : ''}
          ${treatment ? `<div style="padding:7px 14px;border-top:1px solid #e0f2fe;font-size:12px;color:#334155"><strong style="color:#0e7490">Treatment Plan:</strong> ${esc(treatment)}</div>` : ''}
          ${notes     ? `<div style="padding:7px 14px;border-top:1px solid #e0f2fe;font-size:12px;color:#334155;font-style:italic"><strong style="color:#475569">Notes:</strong> ${esc(notes)}</div>` : ''}
          ${cure      ? `<div style="padding:7px 14px;border-top:1px solid #bae6fd;background:#e0f2fe;font-size:12px;color:#0c4a6e;font-weight:600">Approved Cure: ${esc(cure)}</div>` : ''}
        </div>`;
    }).join('');
  }

  const caseCards = cases.map((c, i) => {
    const cat = categorize(c.presenting_complaint);
    const isEmergency = c.emergency_detected;

    return `
      <div style="margin-bottom:32px;border:1px solid ${isEmergency ? '#fca5a5' : '#e2e8f0'};border-radius:10px;overflow:hidden;page-break-inside:avoid;box-shadow:0 1px 4px rgba(0,0,0,0.06)">

        <!-- Card Header -->
        <div style="padding:14px 20px;background:${isEmergency ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#0e7490,#0891b2)'};display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="color:rgba(255,255,255,0.75);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Case ${i + 1} &nbsp;|&nbsp; ${esc(cat)}</div>
            <div style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.3px">${esc(c.case_id)}</div>
          </div>
          <div style="text-align:right">
            ${isEmergency ? `<div style="background:#ffffff;color:#dc2626;font-size:11px;font-weight:800;padding:3px 10px;border-radius:4px;letter-spacing:1px;margin-bottom:6px">EMERGENCY</div>` : ''}
            <div style="color:rgba(255,255,255,0.85);font-size:12px">${fmt(c.created_at)}</div>
          </div>
        </div>

        <!-- Card Body -->
        <div style="padding:18px 20px;background:#ffffff">

          <!-- Patient Snapshot -->
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px">
            ${[
              ['Age',         c.age ? `${c.age} years` : '—'],
              ['Sex',         c.sex],
              ['Confidence',  c.confidence_level],
              ['Status',      c.approved ? 'Approved' : (c.review_status || '—')],
              ['Reviewed By', c.reviewed_by],
              ['Review Date', fmt(c.reviewed_at)],
            ].map(([lbl, val]) => `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;min-width:120px">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:2px">${lbl}</div>
                <div style="font-size:13px;font-weight:600;color:#1e293b">${esc(val)}</div>
              </div>`).join('')}
          </div>

          <!-- Known Conditions -->
          ${c.known_conditions ? `
          <div style="margin-bottom:16px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#92400e;font-weight:600;margin-bottom:4px">Known Conditions / Comorbidities</div>
            <div style="font-size:13px;color:#1e293b">${esc(c.known_conditions)}</div>
          </div>` : ''}

          <!-- Presenting Complaint -->
          <div style="margin-bottom:18px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;font-weight:600;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #0e7490;display:inline-block">Presenting Complaint</div>
            <p style="margin:8px 0 0;font-size:14px;color:#1e293b;line-height:1.65">${esc(c.presenting_complaint)}</p>
          </div>

          <!-- Requires Urgent Review flag -->
          ${c.requires_urgent_review ? `
          <div style="margin-bottom:16px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-size:13px;color:#9a3412">
            <strong>Urgent Review Required</strong> — This case has been flagged for priority clinical attention.
          </div>` : ''}

          <!-- Differentials / Analysis -->
          <div style="margin-bottom:6px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;font-weight:600;margin-bottom:10px;padding-bottom:4px;border-bottom:2px solid #0e7490;display:inline-block">Differential Diagnoses &amp; Analysis</div>
            <div style="margin-top:10px">${renderDifferentials(c.differentials)}</div>
          </div>

        </div>

        <!-- Card Footer -->
        <div style="padding:10px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8">
          <span>Case ID: <strong style="color:#475569">${esc(c.case_id)}</strong></span>
          <span>Vianova Health — Cure Analyzer</span>
          <span>Generated ${fmtFull(meta.generatedAt)}</span>
        </div>

      </div>`;
  }).join('');

  // ─── Assemble HTML ───────────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vianova Health — Cases Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1e293b;
      background: #f0f4f8;
    }

    .page-wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px 60px;
    }

    h2.section-title {
      font-size: 15px;
      font-weight: 700;
      color: #0e7490;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 2px solid #0e7490;
    }

    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 20px 22px;
      margin-bottom: 28px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    table.report-table thead tr {
      background: #0e7490;
    }
    table.report-table thead th {
      padding: 10px 14px;
      color: #ffffff;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      text-align: left;
    }
    table.report-table thead th:first-child { border-radius: 6px 0 0 0; }
    table.report-table thead th:last-child  { border-radius: 0 6px 0 0; }
    table.report-table tbody tr:hover { background: #f0f9ff !important; }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }

    .stat-box {
      background: #ffffff;
      border-radius: 10px;
      padding: 18px 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      position: relative;
      overflow: hidden;
    }
    .stat-box::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: var(--accent, #0e7490);
    }
    .stat-box .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .stat-box .stat-value {
      font-size: 32px;
      font-weight: 800;
      color: var(--accent, #0e7490);
      line-height: 1;
    }
    .stat-box .stat-sub {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }

    @media print {
      body { background: #ffffff; font-size: 12px; }
      .page-wrap { max-width: 100%; padding: 0; }
      .card { box-shadow: none; border: 1px solid #d1d5db; page-break-inside: avoid; }
      .stat-grid { grid-template-columns: repeat(4, 1fr); }
      .two-col { grid-template-columns: 1fr 1fr; }
      h2.section-title { color: #0e7490; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table.report-table thead tr { background: #0e7490 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
<div class="page-wrap">

  <!-- ══════════════════════════════════════════════════════════
       SECTION 1 — HEADER
  ══════════════════════════════════════════════════════════ -->
  <div style="margin-bottom:32px">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">

      <!-- Brand -->
      <div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px">
          <div style="width:48px;height:48px;background:linear-gradient(135deg,#0e7490,#0891b2);border-radius:10px;display:flex;align-items:center;justify-content:center">
            <div style="width:24px;height:24px;border:3px solid #ffffff;border-radius:50%;position:relative">
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:3px;height:14px;background:#ffffff;border-radius:2px"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(90deg);width:3px;height:14px;background:#ffffff;border-radius:2px"></div>
            </div>
          </div>
          <div>
            <div style="font-size:22px;font-weight:800;color:#0e7490;letter-spacing:-0.5px">Vianova Health</div>
            <div style="font-size:12px;color:#64748b;letter-spacing:1px;text-transform:uppercase;font-weight:500">Cure Analyzer</div>
          </div>
        </div>
      </div>

      <!-- Report meta -->
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:4px">Cases Report</div>
        <div style="font-size:12px;color:#64748b">Generated: <strong style="color:#475569">${fmtFull(meta.generatedAt)}</strong></div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">Total Cases: <strong style="color:#0e7490">${total}</strong></div>
        ${meta.doctorName ? `<div style="font-size:12px;color:#64748b;margin-top:2px">Prepared for: <strong style="color:#475569">${esc(meta.doctorName)}</strong></div>` : ''}
      </div>

    </div>

    <hr style="margin:18px 0 0;border:none;border-top:3px solid #0e7490;border-radius:2px" />
  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECTION 2 — SUMMARY STATISTICS
  ══════════════════════════════════════════════════════════ -->
  <div class="stat-grid">

    <div class="stat-box" style="--accent:#0e7490">
      <div class="stat-label">Total Cases</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">All time records</div>
    </div>

    <div class="stat-box" style="--accent:#059669">
      <div class="stat-label">Approved</div>
      <div class="stat-value">${approved}</div>
      <div class="stat-sub">${pct(approved, total)}% of total</div>
    </div>

    <div class="stat-box" style="--accent:#d97706">
      <div class="stat-label">Pending Review</div>
      <div class="stat-value">${pending}</div>
      <div class="stat-sub">${pct(pending, total)}% of total</div>
    </div>

    <div class="stat-box" style="--accent:#dc2626">
      <div class="stat-label">Emergency</div>
      <div class="stat-value">${emergency}</div>
      <div class="stat-sub">${pct(emergency, total)}% of total</div>
    </div>

  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECTION 3 & 4 — STATUS + CONFIDENCE BREAKDOWN
  ══════════════════════════════════════════════════════════ -->
  <div class="two-col">

    <!-- Status Breakdown -->
    <div class="card">
      <h2 class="section-title">Status Breakdown</h2>
      <table class="report-table">
        <thead>
          <tr>
            <th>Status</th>
            <th style="text-align:center;width:70px">Count</th>
            <th style="text-align:center;width:60px">%</th>
            <th style="width:120px">Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${statusRows}
          <tr style="background:#f8fafc;font-weight:700">
            <td style="padding:10px 14px;color:#0e7490">Total</td>
            <td style="padding:10px 14px;text-align:center">${total}</td>
            <td style="padding:10px 14px;text-align:center;color:#64748b">100%</td>
            <td style="padding:10px 14px"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Confidence Breakdown -->
    <div class="card">
      <h2 class="section-title">Confidence Breakdown</h2>
      <table class="report-table">
        <thead>
          <tr>
            <th>Level</th>
            <th style="text-align:center;width:70px">Count</th>
            <th style="text-align:center;width:60px">%</th>
            <th style="width:120px">Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${confRows}
          <tr style="background:#f8fafc;font-weight:700">
            <td style="padding:10px 14px;color:#0e7490">Total</td>
            <td style="padding:10px 14px;text-align:center">${total}</td>
            <td style="padding:10px 14px;text-align:center;color:#64748b">100%</td>
            <td style="padding:10px 14px"></td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECTION 5 — CASE CATEGORIES
  ══════════════════════════════════════════════════════════ -->
  <div class="card">
    <h2 class="section-title">Case Categories</h2>
    <table class="report-table">
      <thead>
        <tr>
          <th>Category</th>
          <th style="text-align:center;width:70px">Cases</th>
          <th style="text-align:center;width:60px">%</th>
          <th>Distribution</th>
        </tr>
      </thead>
      <tbody>
        ${catRows}
      </tbody>
    </table>
  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECTION 6 — FULL CASES TABLE
  ══════════════════════════════════════════════════════════ -->
  <div class="card" style="overflow-x:auto">
    <h2 class="section-title">All Cases — Summary Table</h2>
    <table class="report-table" style="min-width:960px">
      <thead>
        <tr>
          <th style="text-align:center;width:36px">#</th>
          <th>Case ID</th>
          <th style="width:80px">Age / Sex</th>
          <th style="width:130px">Category</th>
          <th>Presenting Complaint</th>
          <th style="text-align:center;width:90px">Confidence</th>
          <th style="text-align:center;width:80px">Emergency</th>
          <th style="width:100px">Status</th>
          <th style="width:110px">Reviewed By</th>
          <th style="width:90px">Date</th>
        </tr>
      </thead>
      <tbody>
        ${caseTableRows || `<tr><td colspan="10" style="text-align:center;padding:24px;color:#94a3b8;font-style:italic">No cases to display</td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECTION 7 — DETAILED CASE CARDS
  ══════════════════════════════════════════════════════════ -->
  <div style="margin-bottom:10px">
    <h2 class="section-title" style="font-size:16px;border-bottom:3px solid #0e7490;padding-bottom:10px">Detailed Case Records</h2>
    <p style="color:#64748b;font-size:13px;margin-bottom:24px">
      Individual case analysis including patient snapshot, differential diagnoses, treatment plans, and clinical notes.
    </p>
  </div>

  ${caseCards || `
  <div class="card" style="text-align:center;padding:40px;color:#94a3b8;font-style:italic">
    No detailed case records available.
  </div>`}

  <!-- ══════════════════════════════════════════════════════════
       FOOTER
  ══════════════════════════════════════════════════════════ -->
  <div style="margin-top:48px;padding-top:20px;border-top:2px solid #e2e8f0">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#0e7490">Vianova Health — Cure Analyzer</div>
      <div style="font-size:11px;color:#94a3b8">Report generated on ${fmtFull(meta.generatedAt)} — ${total} case(s) included</div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#92400e;margin-bottom:6px">Medical Disclaimer</div>
      <p style="font-size:12px;color:#78350f;line-height:1.65;margin:0">
        This report is generated by an AI-assisted clinical decision support system and is intended solely
        for use by qualified, licensed medical professionals. All AI-generated differentials, treatment
        recommendations, and confidence assessments must be independently reviewed and validated by a
        licensed clinician prior to any clinical application. This document does not constitute a
        definitive medical diagnosis or treatment directive. Vianova Health and its affiliates accept no
        liability for clinical decisions made on the basis of this report without appropriate professional
        oversight. Patient confidentiality must be maintained in accordance with applicable data protection
        regulations (HIPAA, GDPR, or applicable local law).
      </p>
    </div>
    <div style="margin-top:12px;text-align:center;font-size:11px;color:#cbd5e1">
      Confidential — For authorised clinical personnel only
    </div>
  </div>

</div>
</body>
</html>`;
}

module.exports = { generateCasesReport };
