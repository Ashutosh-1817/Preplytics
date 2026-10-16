import ConfirmDialog from './ConfirmDialog.jsx';

const formatRunningFor = (minutes) => {
  if (!minutes || minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

// "A session for “GATE 2027” (Operating Systems) is currently running.
//  Should I close it and start this one?"  [Yes, close it and start] [No, keep it running]
function SessionConflictDialog({ conflict, onConfirm, onCancel }) {
  const goal = conflict.goalTitle ? `“${conflict.goalTitle}”` : 'a deleted goal';
  const topic = conflict.nodeTitle ? ` (${conflict.nodeTitle})` : '';

  return (
    <ConfirmDialog
      title="A session is already running"
      message={
        <>
          A session for <strong>{goal}</strong>
          {topic} is currently running ({formatRunningFor(conflict.elapsedMinutes)} so far). Should I close it and
          start this one? The time already tracked will be saved.
        </>
      }
      confirmLabel="Yes, close it and start"
      cancelLabel="No, keep it running"
      danger={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default SessionConflictDialog;