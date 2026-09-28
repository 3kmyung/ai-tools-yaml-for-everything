export function createExclusiveRunner(onBusyChange: (isBusy: boolean) => void) {
  let isBusy = false;
  return function tryRun(task: () => Promise<void>): boolean {
    if (isBusy) return false;
    isBusy = true;
    onBusyChange(true);
    void task().finally(() => {
      isBusy = false;
      onBusyChange(false);
    });
    return true;
  };
}

export interface FulfillmentSteps {
  showPending: () => void;
  fulfill: () => Promise<void>;
  reload: () => Promise<void>;
  clearPending: () => void;
}

export async function runFulfillment({ showPending, fulfill, reload, clearPending }: FulfillmentSteps): Promise<void> {
  showPending();
  try {
    await fulfill();
  } finally {
    try {
      await reload();
    } finally {
      clearPending();
    }
  }
}
