import { getCurrentInstance, onBeforeUnmount } from 'vue';

const COMPENSATED_SELECTOR = '[data-scroll-lock-compensate]';

let holders = 0;
let release: (() => void) | null = null;

function engage(): void {
  const body = document.body;
  const { scrollX, scrollY } = window;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    width: body.style.width,
  };

  // iOS Safari keeps scrolling the page under `overflow: hidden`, so the body is
  // pinned at its current offset and the offset replayed when the lock releases.
  body.style.position = 'fixed';
  body.style.top = `${-scrollY}px`;
  body.style.left = `${-scrollX}px`;
  body.style.width = '100%';

  // Pinning the body drops the scrollbar, widening the viewport that both the
  // body and any fixed element size against.
  const compensated = scrollbarWidth > 0 ? [body, ...document.querySelectorAll<HTMLElement>(COMPENSATED_SELECTOR)] : [];
  const previousPadding = compensated.map((element) => element.style.paddingRight);

  for (const element of compensated) element.style.paddingRight = `${scrollbarWidth}px`;

  release = () => {
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.width = previous.width;
    compensated.forEach((element, index) => {
      element.style.paddingRight = previousPadding[index] ?? '';
    });
    window.scrollTo(scrollX, scrollY);
  };
}

export function useScrollLock() {
  let holding = false;

  function lock(): void {
    if (holding) return;

    holding = true;
    holders += 1;
    if (holders === 1) engage();
  }

  function unlock(): void {
    if (!holding) return;

    holding = false;
    holders -= 1;
    if (holders > 0) return;

    release?.();
    release = null;
  }

  if (getCurrentInstance()) onBeforeUnmount(unlock);

  return { lock, unlock };
}
