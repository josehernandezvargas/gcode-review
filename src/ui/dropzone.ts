export interface DropZoneElements {
  /** The visible drop box: clicking it browses, and it highlights while a file is dragged over the page. */
  container: HTMLElement;
  input: HTMLInputElement;
  /**
   * Where a dropped file is accepted. Defaults to `container`; pass the whole
   * page so a file dropped beside the box still loads instead of the browser
   * navigating away to display it.
   */
  dropTarget?: HTMLElement;
}

/** Wires drag-and-drop, click-to-browse and keyboard activation onto the drop zone; fires onFile with the chosen file. */
export function initDropZone(elements: DropZoneElements, onFile: (file: File) => void): void {
  const { container, input } = elements;
  const dropTarget = elements.dropTarget ?? container;

  container.addEventListener('click', () => input.click());
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // Reset so choosing the same file again still fires `change`.
    input.value = '';
    if (file) onFile(file);
  });

  // dragenter/dragleave fire for every child element crossed, so count depth
  // rather than toggling — otherwise the highlight flickers off mid-drag.
  let dragDepth = 0;

  dropTarget.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth++;
    container.classList.add('drag-over');
  });

  dropTarget.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  dropTarget.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) container.classList.remove('drag-over');
  });

  dropTarget.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    container.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}
