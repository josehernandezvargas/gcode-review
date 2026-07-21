export interface DropZoneElements {
  container: HTMLElement;
  input: HTMLInputElement;
}

/** Wires drag-and-drop and click-to-browse onto the drop zone; fires onFile with the chosen file. */
export function initDropZone(elements: DropZoneElements, onFile: (file: File) => void): void {
  const { container, input } = elements;

  container.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  });

  container.addEventListener('dragover', (event) => {
    event.preventDefault();
    container.classList.add('drag-over');
  });

  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });

  container.addEventListener('drop', (event) => {
    event.preventDefault();
    container.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}
