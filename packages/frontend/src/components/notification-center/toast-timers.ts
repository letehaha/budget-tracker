import { toast } from 'vue-sonner';

type ToastTimerId = number | string;

interface ToastTimer {
  durationMs: number;
  onExpire?: () => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

const timers = new Map<ToastTimerId, ToastTimer>();
let isHeld = false;

const stopTimer = ({ timer }: { timer: ToastTimer }) => {
  if (timer.timeoutId === null) return;

  clearTimeout(timer.timeoutId);
  timer.timeoutId = null;
};

const startTimer = ({ id, timer }: { id: ToastTimerId; timer: ToastTimer }) => {
  // setTimeout coerces a non-finite delay to 0, which would dismiss the toast on the next tick.
  if (!Number.isFinite(timer.durationMs)) return;

  timer.timeoutId = setTimeout(() => {
    timers.delete(id);
    // Ordered before the dismiss so the caller can drop the id while it is still safe to re-raise.
    timer.onExpire?.();
    toast.dismiss(id);
  }, timer.durationMs);
};

export const registerToast = ({
  id,
  durationMs,
  onExpire,
}: {
  id: ToastTimerId;
  durationMs: number;
  onExpire?: () => void;
}) => {
  const existing = timers.get(id);
  if (existing) stopTimer({ timer: existing });

  const timer: ToastTimer = { durationMs, onExpire, timeoutId: null };
  timers.set(id, timer);

  if (!isHeld) startTimer({ id, timer });
};

export const unregisterToast = ({ id }: { id: ToastTimerId }) => {
  const timer = timers.get(id);
  if (!timer) return;

  stopTimer({ timer });
  timers.delete(id);
};

export const holdToastTimers = () => {
  isHeld = true;
  timers.forEach((timer) => stopTimer({ timer }));
};

// Every held toast gets its full duration back, so leaving the stack always grants a full read.
export const releaseToastTimers = () => {
  isHeld = false;
  timers.forEach((timer, id) => {
    stopTimer({ timer });
    startTimer({ id, timer });
  });
};
