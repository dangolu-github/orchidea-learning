(() => {
  function refresh() {
    document.querySelectorAll("[data-exam-id]").forEach((card) => {
      const id = card.dataset.examId;
      const status = card.querySelector(".status");
      try {
        const result = JSON.parse(localStorage.getItem(`orchidea:result:${id}`) || "null");
        if (result) { status.textContent = `Submitted · ${result.score}/${result.total}`; return; }
        const draft = JSON.parse(localStorage.getItem(`orchidea:draft:${id}`) || "null");
        const count = draft ? Object.values(draft.answers || {}).filter((x) => String(x).trim()).length : 0;
        status.textContent = count ? `Draft · ${count}/60` : "Not started";
      } catch (_) { status.textContent = "Not started"; }
    });
  }
  refresh(); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", refresh);
})();
