// ApprovalTimer component: shows countdown until next approval call (for reporting managers)
function ApprovalTimer({ taskId, subtaskId }: { taskId: number; subtaskId: number }) {
  const [nextCallAt, setNextCallAt] = React.useState<Date | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    async function fetchNext() {
      try {
        const res = await apiClient.get(`/finops/external-alerts?task_id=${taskId}&subtask_id=${subtaskId}`);
        const next = res?.next_call_at ? new Date(res.next_call_at) : null;
        if (!mountedRef.current) return;
        setNextCallAt(next);
        setRemaining(next ? Math.max(0, Math.floor((next.getTime() - Date.now()) / 1000)) : null);
      } catch (e) {
        console.warn('ApprovalTimer fetch error:', e);
      }
    }

    fetchNext();

    const refetchInterval = setInterval(() => {
      fetchNext();
    }, 30 * 1000); // refresh every 30s in case schedule updated

    return () => {
      mountedRef.current = false;
      clearInterval(refetchInterval);
    };
  }, [taskId, subtaskId]);

  // countdown tick
  React.useEffect(() => {
    if (remaining === null) return;
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return null;
        if (r <= 1) return 0;
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  if (!nextCallAt || remaining === null) return null;

  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className="text-sm text-gray-600 mt-2">
      <div>Approve call in: <strong>{minutes}:{seconds}</strong></div>
      <div className="text-xs text-gray-500">Next scheduled call: {formatToISTDateTime(nextCallAt.toISOString(), { second: '2-digit' })} IST</div>
    </div>
  );
}
