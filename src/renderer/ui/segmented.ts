// Segmented rocker controls — mirror clicks onto the underlying <select> so
// all existing value/change-event logic keeps working unmodified.
export function wireSegmented(groupEl: HTMLElement): void {
  const select = document.getElementById(groupEl.dataset.for!) as HTMLSelectElement;
  const buttons = [...groupEl.querySelectorAll<HTMLButtonElement>("button")];
  const descriptionEl = document.getElementById(`${select.id}-description`);

  function sync() {
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.value === select.value));
    if (descriptionEl) {
      descriptionEl.textContent = select.options[select.selectedIndex]?.textContent ?? "";
    }
  }

  buttons.forEach((b) => {
    b.addEventListener("click", () => {
      if (select.value === b.dataset.value) return;
      select.value = b.dataset.value!;
      select.dispatchEvent(new Event("change"));
      sync();
    });
  });

  select.addEventListener("change", sync);
  sync();
}

export function wireAllSegmented(): void {
  document.querySelectorAll<HTMLElement>(".segmented").forEach(wireSegmented);
}
