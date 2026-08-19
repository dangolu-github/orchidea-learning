(() => {
  const exam = JSON.parse(document.getElementById("exam-data").textContent);
  const form = document.getElementById("exam-form");
  const fields = [...form.querySelectorAll("input[name]")];
  const ids = [...new Set(fields.map((field) => field.name))];
  const draftKey = `orchidea:draft:${exam.id}`;
  const resultKey = `orchidea:result:${exam.id}`;
  const attemptKey = `orchidea:attempt:${exam.id}`;
  const status = document.getElementById("submit-status");
  const progressCount = document.getElementById("progress-count");
  const progressFill = document.getElementById("progress-fill");
  const draftState = document.getElementById("draft-state");
  const dialog = document.getElementById("submit-dialog");
  const endpoint = window.ORCHIDEA_SUBMISSION_ENDPOINT || "";
  let waitingNonce = null;
  let waitTimer = null;

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).toLowerCase();
  const attemptId = localStorage.getItem(attemptKey) || `attempt-${uuid()}`;
  localStorage.setItem(attemptKey, attemptId);

  function answers() {
    return Object.fromEntries(ids.map((id) => {
      const group = form.elements[id];
      if (group instanceof RadioNodeList) return [id, group.value || ""];
      return [id, group.value.trim()];
    }));
  }
  function answeredCount(values = answers()) { return Object.values(values).filter((value) => String(value).trim()).length; }
  function updateProgress(values = answers()) {
    const count = answeredCount(values);
    progressCount.textContent = `${count} / ${exam.total} answered`;
    progressFill.style.width = `${count / exam.total * 100}%`;
  }
  function saveDraft() {
    const values = answers();
    localStorage.setItem(draftKey, JSON.stringify({ answers: values, savedAt: new Date().toISOString() }));
    draftState.textContent = `Draft saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    updateProgress(values);
  }
  function restoreDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (!saved || !saved.answers) return;
      for (const [id, value] of Object.entries(saved.answers)) {
        const group = form.elements[id];
        if (!group) continue;
        if (group instanceof RadioNodeList) [...group].forEach((radio) => { radio.checked = radio.value === value; });
        else group.value = value;
      }
      draftState.textContent = "Draft restored from this device";
    } catch (_) {}
  }
  let saveTimer;
  form.addEventListener("input", () => { clearTimeout(saveTimer); updateProgress(); saveTimer = setTimeout(saveDraft, 250); });
  form.addEventListener("change", saveDraft);

  document.getElementById("submit-open").addEventListener("click", () => {
    const remaining = exam.total - answeredCount();
    document.getElementById("dialog-summary").textContent = remaining ? `${remaining} question${remaining === 1 ? " is" : "s are"} unanswered. Unanswered questions receive 0 marks.` : "All 60 questions have an answer.";
    dialog.showModal();
  });
  dialog.addEventListener("close", () => { if (dialog.returnValue === "confirm") submitFinal(); });

  function submitFinal() {
    if (!endpoint || endpoint.includes("__SUBMISSION_ENDPOINT__")) {
      status.textContent = "Submission is not available yet. Your draft is still saved on this device.";
      return;
    }
    const button = document.getElementById("submit-open");
    button.disabled = true;
    status.textContent = "Submitting for marking…";
    waitingNonce = `nonce-${uuid()}`;
    const payload = { assignmentId: exam.id, attemptId, nonce: waitingNonce, answers: answers() };
    const receiptForm = document.getElementById("receipt-form");
    receiptForm.action = endpoint;
    document.getElementById("receipt-payload").value = JSON.stringify(payload);
    receiptForm.submit();
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => {
      if (!waitingNonce) return;
      waitingNonce = null; button.disabled = false;
      status.textContent = "No receipt arrived. Your draft is safe; please check your connection and try again.";
    }, 35000);
  }

  window.addEventListener("message", (event) => {
    const allowed = event.origin === "https://script.google.com" || /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/i.test(event.origin) || event.origin === "https://script.googleusercontent.com";
    const result = event.data;
    if (!allowed || !result || result.type !== "orchidea-b1-mock-result" || result.assignmentId !== exam.id || result.nonce !== waitingNonce) return;
    clearTimeout(waitTimer); waitingNonce = null;
    if (!result.ok) { document.getElementById("submit-open").disabled = false; status.textContent = result.message || "Submission failed; your draft is safe."; return; }
    localStorage.setItem(resultKey, JSON.stringify(result));
    renderResult(result);
  });

  function renderResult(result) {
    document.body.classList.add("submitted");
    fields.forEach((field) => { field.disabled = true; });
    document.getElementById("submit-open").disabled = true;
    status.textContent = result.duplicate ? "Original receipt restored." : "Submission received and marked.";
    const panel = document.getElementById("result-panel");
    panel.hidden = false;
    panel.innerHTML = `<p class="eyebrow">SUBMISSION RECEIPT</p><h2>${result.score} / ${result.total}</h2><p>Your first submitted attempt is locked. Review each item below.</p><div class="result-grid"><div><strong>${result.score}</strong><span>Total</span></div><div><strong>${result.sectionScores.Grammar}/20</strong><span>Grammar</span></div><div><strong>${result.sectionScores.Reading}/20</strong><span>Reading</span></div><div><strong>${result.sectionScores.Listening}/20</strong><span>Listening</span></div></div><p class="small">Receipt: ${new Date(result.receiptTime).toLocaleString()} · Attempt ${result.attemptId.slice(-8)}</p><button class="primary" type="button" id="print-result">Print / Save PDF</button>`;
    document.getElementById("print-result").addEventListener("click", () => window.print());
    result.details.forEach((item) => {
      const box = document.querySelector(`[data-question="${item.id}"]`);
      const feedback = document.getElementById(`feedback-${item.id}`);
      box.classList.add(item.correct ? "correct" : "incorrect");
      feedback.hidden = false;
      const verdict = document.createElement("p"); verdict.textContent = item.correct ? "✓ Correct" : "✗ Incorrect";
      const submitted = document.createElement("p"); submitted.textContent = `Your answer: ${item.submitted || "No answer"}`;
      const answer = document.createElement("p"); answer.textContent = `Accepted answer: ${item.answer}`;
      const why = document.createElement("p"); why.textContent = item.explanation;
      feedback.replaceChildren(verdict, submitted, answer, why);
    });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  restoreDraft(); updateProgress();
  try { const stored = JSON.parse(localStorage.getItem(resultKey) || "null"); if (stored && stored.assignmentId === exam.id) renderResult(stored); } catch (_) {}
})();

