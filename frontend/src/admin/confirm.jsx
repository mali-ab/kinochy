'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [confirm, setConfirm] = useState(null);

  const requestConfirm = useCallback((options) => setConfirm(options), []);
  const close = useCallback(() => setConfirm(null), []);

  async function confirmAction() {
    const action = confirm?.onConfirm;
    setConfirm(null);
    await action?.();
  }

  const value = useMemo(() => ({ requestConfirm }), [requestConfirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {confirm ? (
        <div className="modal-backdrop" onClick={close}>
          <div className="confirm-panel" onClick={(event) => event.stopPropagation()}>
            <h2>{confirm.title}</h2>
            <p>{confirm.body}</p>
            <div>
              <button onClick={close}>Cancel</button>
              <button className={confirm.danger ? 'danger' : ''} onClick={confirmAction}>
                {confirm.actionLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside ConfirmProvider.');
  return value;
}
