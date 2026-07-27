/** HTML5 drag-and-drop helpers */
export function makeDraggable(el, getPayload) {
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    const payload = getPayload();
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("is-dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
}

export function makeDropZone(el, onDrop, acceptType) {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.classList.add("drop-over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drop-over");
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (acceptType && data.type !== acceptType) return;
      onDrop(data, e);
    } catch {
      /* ignore invalid drops */
    }
  });
}
