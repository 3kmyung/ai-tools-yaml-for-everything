export function markFieldDefault(control, revert, isDefault) {
  control.classList.toggle("is-default", isDefault);
  revert.disabled = isDefault;
}

export function attachTextField(parts) {
  const refresh = () => markFieldDefault(parts.control, parts.revert, parts.input.value.trim() === "");

  parts.input.addEventListener("input", refresh);
  parts.revert.addEventListener("click", () => {
    parts.input.value = "";
    refresh();
    parts.input.focus();
  });

  refresh();
}
