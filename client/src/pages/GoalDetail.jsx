import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ListChecks, CalendarPlus, RefreshCw, Pencil, CalendarDays, Clock, BookOpen, MousePointerClick } from 'lucide-react';
import {
  fetchGoal,
  fetchRoadmapTree,
  createNode,
  updateNode,
  deleteNode,
  generateSchedule,
  regenerateSchedule,
} from '../services/goals.api.js';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import { formatDuration } from '../utils/formatDuration.js';
import RoadmapTree from '../components/RoadmapTree.jsx';
import SyllabusPreviewModal from '../components/SyllabusPreviewModal.jsx';
import EditGoalModal from '../components/EditGoalModal.jsx';
import SessionTimer from '../components/SessionTimer.jsx';
import FileAttachments from '../components/files/FileAttachments.jsx';
import './GoalDetail.css';
import GoalRoadmapWizard from '../components/GoalRoadmapWizard.jsx';
import GoalOverviewCard from '../components/GoalOverviewCard.jsx';
import GoalSubjectsModal from '../components/GoalSubjectsModal.jsx';
import { markSessionHandoff } from '../utils/sessionHandoff.js';
import ChangeLevelDialog from '../components/roadmap/ChangeLevelDialog.jsx';

const findNodeById = (nodes, id) => {
  for (const node of nodes) {
    if (node._id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
};

// Totals for the stat strip: only topics you can actually study (actionable nodes) are counted.
const summarizeTree = (nodes) => {
  const totals = { total: 0, done: 0, spent: 0, remaining: 0 };
  const walk = (list) => {
    list.forEach((n) => {
      if (n.isActionable) {
        totals.total += 1;
        totals.spent += n.actualMinutesSpent || 0;
        if (n.status === 'completed') totals.done += 1;
        else totals.remaining += n.estimatedMinutes || 0;
      }
      walk(n.children || []);
    });
  };
  walk(nodes);
  return totals;
};

const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };

const overloadNote = (r) =>
  r?.isOverloaded
    ? ` ⚠ This plan needs about ${formatDuration(r.requiredDailyMinutes)} a day, more than your ${formatDuration(r.dailyCapacityMinutes)} daily time.`
    : '';

function GoalDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { goalId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setDrawerContext, clearDrawerContext } = useAIDrawer();

  const [goal, setGoal] = useState(null);
  const [tree, setTree] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [showScheduleSuccess, setShowScheduleSuccess] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRoadmapWizard, setShowRoadmapWizard] = useState(false);
  const [pendingWizard, setPendingWizard] = useState(Boolean(location.state?.autoGenerate));
  const [subjectForModal, setSubjectForModal] = useState(null);
  const [showSubjectsModal, setShowSubjectsModal] = useState(false);

  const selectedNode = tree && selectedNodeId ? findNodeById(tree, selectedNodeId) : null;
  const [nodeForLevel, setNodeForLevel] = useState(null);

  const loadAll = async () => {
    const [g, t] = await Promise.all([fetchGoal(goalId), fetchRoadmapTree(goalId)]);
    setGoal(g);
    setTree(t);
  };

  useEffect(() => {
    loadAll();
  }, [goalId]);

  const handleSelectNode = (node) => {
    setSelectedNodeId(node._id);
    setDrawerContext('node', node._id, `Topic: ${node.title}`);
  };

  // Arriving from the dashboard's Start button (?node=...)
  useEffect(() => {
    const nodeParam = searchParams.get('node');
    if (!nodeParam || !tree) return;

    const found = findNodeById(tree, nodeParam);
    if (found) handleSelectNode(found);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  useEffect(() => {
    if (selectedNodeId && tree && !findNodeById(tree, selectedNodeId)) {
      setSelectedNodeId(null);
      clearDrawerContext();
    }
  }, [tree, selectedNodeId, clearDrawerContext]);

  useEffect(() => () => clearDrawerContext(), [clearDrawerContext]);

  useEffect(() => {
  if (location.state?.autoGenerate) navigate(location.pathname, { replace: true, state: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!newSubjectTitle.trim()) return;
    await createNode(goalId, { title: newSubjectTitle.trim(), parentId: null });
    setNewSubjectTitle('');
    loadAll();
  };

  const handleAddChild = async (parentId, title) => {
    await createNode(goalId, { title, parentId });
    loadAll();
  };

  const handleToggleComplete = async (node) => {
    const newStatus = node.status === 'completed' ? 'not_started' : 'completed';
    await updateNode(node._id, { status: newStatus });
    loadAll();
  };

  const handleDeleteNode = async (nodeId) => {
    await deleteNode(nodeId);
    loadAll();
  };

  const handleGenerateSchedule = async () => {
    try {
      const result = await generateSchedule(goalId);
      setScheduleMessage(`Created ${result.created} scheduled tasks.${overloadNote(result)}`);
      await loadAll();
      setShowScheduleSuccess(true);
    } catch (err) {
      setScheduleMessage(err.response?.data?.error?.message || 'Could not generate schedule.');
    }
  };

  const handleRegenerateSchedule = async () => {
    try {
      const result = await regenerateSchedule(goalId);
      setScheduleMessage(`Schedule updated — ${result.created} new tasks.${overloadNote(result)}`);
      await loadAll();
      setShowScheduleSuccess(true);
    } catch (err) {
      setScheduleMessage(err.response?.data?.error?.message || 'Could not regenerate schedule.');
    }
  };

 const handleSubjectRoadmapSaved = async (result) => {
  const title = subjectForModal?.title;
  setSubjectForModal(null);
  setScheduleMessage(
    `“${title}”: ${result.chaptersCreated} chapters, ${result.subtopicsCreated} subtopics added.` +
      (result.schedule.created > 0 ? ` ${result.schedule.created} tasks scheduled.${overloadNote(result.schedule)}` : '')
  );
  await loadAll();
  if (result.schedule.created > 0) setShowScheduleSuccess(true);
};

const handleSubjectsSaved = async (result) => {
  setShowSubjectsModal(false);
  setScheduleMessage(
    `${result.subjectsCreated} subject${result.subjectsCreated === 1 ? '' : 's'} added` +
      (result.skipped > 0 ? ` (${result.skipped} already existed)` : '') +
      '. Open a subject and generate its roadmap when you are ready.'
  );
  await loadAll();
};

  const handleRoadmapSaved = (result) => {
  setShowRoadmapWizard(false);
  setScheduleMessage(
    `Roadmap ready: ${result.subjectsCreated} subjects, ${result.chaptersCreated} chapters, ${result.subtopicsCreated} topics.` +
      (result.schedule.created > 0 ? ` ${result.schedule.created} tasks scheduled.${overloadNote(result.schedule)}` : '')
  );
  loadAll();
  if (result.schedule.created > 0) setShowScheduleSuccess(true);
};

  const handleGoalSaved = async () => {
    setShowEditModal(false);
    setScheduleMessage('Goal updated. Regenerate your schedule to apply the new deadline or daily time.');
    await loadAll();
  };

  if (!goal || !tree) return <div className="skeleton" style={{ height: 300 }} />;

  const stats = summarizeTree(tree);
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  const dueLabel = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <div className="goal-detail">
      <div className="goal-detail-header">
        <div className="goal-detail-heading">
          <div className="goal-detail-title-row">
            <span className="goal-dot" style={{ background: goal.color }} />
            <h1 className="text-stat">{goal.title}</h1>
            <button className="goal-edit-btn" onClick={() => setShowEditModal(true)} title="Edit goal" aria-label="Edit goal">
              <Pencil size={15} />
            </button>
          </div>
          <div className="goal-detail-meta">
            <span className="goal-meta-pill">
              <CalendarDays size={12} /> {dueLabel ? `Due ${dueLabel}` : 'Open-ended'}
            </span>
            <span className="goal-meta-pill">
              <Clock size={12} /> {formatDuration(goal.dailyAvailableMinutes)} / day
            </span>
          </div>
        </div>

        <div className="goal-detail-actions">
          <button className="btn btn-ghost gd-action" onClick={handleGenerateSchedule}>
            <CalendarPlus size={16} /> Generate schedule
          </button>
          <button className="btn btn-ghost gd-action" onClick={handleRegenerateSchedule}>
            <RefreshCw size={16} /> Regenerate
          </button>
        </div>
      </div>

      <div className="gd-stats">
        <div className="gd-stat">
          <span className="gd-stat-label">Progress</span>
          <span className="gd-stat-value">{percent}<small>%</small></span>
          <div className="gd-stat-bar"><i style={{ width: `${percent}%` }} /></div>
        </div>
        <div className="gd-stat">
          <span className="gd-stat-label">Topics done</span>
          <span className="gd-stat-value">{stats.done}<small>of {stats.total}</small></span>
        </div>
        <div className="gd-stat">
          <span className="gd-stat-label">Time spent</span>
          <span className="gd-stat-value">{formatDuration(stats.spent)}</span>
        </div>
        <div className="gd-stat">
          <span className="gd-stat-label">Planned time left</span>
          <span className="gd-stat-value">{stats.remaining ? formatDuration(stats.remaining) : '—'}</span>
        </div>
      </div>

      <GoalOverviewCard
        goalId={goalId}
        initialOverview={goal.overview}
        autoGenerate={pendingWizard}
        onSettled={() => {
          setPendingWizard(false);
          setShowRoadmapWizard(true);
        }}
      />

      {scheduleMessage && (
        <div className="surface" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-sm)' }}>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>{scheduleMessage}</p>
        </div>
      )}

      <div className="goal-detail-body">
        <div className="surface roadmap-panel">
          <div className="roadmap-panel-header">
            <h3>Roadmap</h3>
          </div>

          {tree.length === 0 && (
            <div className="roadmap-start" style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>Start your roadmap</h3>
              <ol className="text-muted" style={{ fontSize: 'var(--text-sm)', paddingLeft: '1.2rem', display: 'grid', gap: 4 }}>
                <li>Optional: open “Know Your Goal” above for a quick briefing.</li>
                <li>Generate the main subjects and review the list.</li>
                <li>Open a subject and generate its chapters and topics, one subject at a time.</li>
              </ol>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setShowSubjectsModal(true)}>
                  <ListChecks size={16} /> Generate subjects 
               </button>
                <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>or add your first subject below</span>
              </div>
            </div>
          )}

          <div className="roadmap-scroll">

            {tree.some((n) => n.children.length === 0 && !n.isActionable) && (
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)', padding: '0 var(--space-4) var(--space-2)' }}>
                Open a subject and choose “Generate roadmap for this subject” to plan its chapters and topics.
              </p>
            )}

            <RoadmapTree
              nodes={tree}
              onAddChild={handleAddChild}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteNode}
              onSelect={handleSelectNode}
              selectedNodeId={selectedNodeId}
              onGenerateSubject={setSubjectForModal}
              onChangeLevel={setNodeForLevel}
            />
          </div>

          <form className="roadmap-add-subject" onSubmit={handleAddSubject}>
            <input
              className="auth-input"
              placeholder="+ Add a subject…"
              value={newSubjectTitle}
              onChange={(e) => setNewSubjectTitle(e.target.value)}
            />
          </form>
        </div>

        <div className="surface node-detail-panel">
          {selectedNode ? (
            <>
              <div className="node-detail-head">
                <h3>{selectedNode.title}</h3>
                <div className="node-chips">
                  <span className={`node-chip ${selectedNode.status === 'completed' ? 'is-done' : selectedNode.status === 'in_progress' ? 'is-active' : ''}`}>
                    {STATUS_LABEL[selectedNode.status] || selectedNode.status.replace('_', ' ')}
                  </span>
                  {selectedNode.isActionable && (
                    <>
                      <span className="node-chip"><Clock size={12} /> Est. {selectedNode.estimatedMinutes ? formatDuration(selectedNode.estimatedMinutes) : '—'}</span>
                      <span className="node-chip">Spent {formatDuration(selectedNode.actualMinutesSpent || 0)}</span>
                    </>
                  )}
                </div>
              </div>
              {selectedNode.isActionable && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginBottom: 'var(--space-3)', width: '100%' }}
                    onClick={() => {
                      markSessionHandoff(selectedNode._id);
                      navigate(`/prephub/${selectedNode._id}`);
                    }}
                  >
                    <BookOpen size={16} /> Open PrepHub
                  </button>
                  <SessionTimer nodeId={selectedNode._id} onSessionLogged={loadAll} />
                </>
              )}
              <FileAttachments key={selectedNode._id} nodeId={selectedNode._id} title="Files for this topic" />
            </>
          ) : (
            <div className="node-empty">
              <MousePointerClick size={26} />
              <strong>Pick a topic</strong>
              <span>Select a topic in the roadmap to see its time, files and study timer.</span>
            </div>
          )}
        </div>
      </div>

      {showScheduleSuccess && (
        <div className="modal-backdrop" onClick={() => setShowScheduleSuccess(false)}>
          <div className="modal-panel surface" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-stat" style={{ fontSize: 'var(--text-lg)' }}>Schedule generated</h2>
            <p className="text-muted">{scheduleMessage}</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button className="btn btn-ghost" onClick={() => setShowScheduleSuccess(false)} style={{ flex: 1 }}>
                Stay here
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/calendar')} style={{ flex: 1 }}>
                View in Calendar →
              </button>
            </div>
          </div>
        </div>
      )}


      {nodeForLevel && (
       <ChangeLevelDialog
          goalId={goalId}
          node={nodeForLevel}
          onClose={() => setNodeForLevel(null)}
          onApplied={async () => {
            setNodeForLevel(null);
            await loadAll();
          }}
        />
      )}

      {showRoadmapWizard && (
        <GoalRoadmapWizard
          goalId={goalId}
          goalTitle={goal.title}
          onClose={() => setShowRoadmapWizard(false)}
          onSaved={handleRoadmapSaved}
        />
      )}

      {subjectForModal && (
        <SyllabusPreviewModal
          goalId={goalId}
          subjectNode={subjectForModal}
          onClose={() => setSubjectForModal(null)}
          onSaved={handleSubjectRoadmapSaved}
        />
      )}

      {showSubjectsModal && (
        <GoalSubjectsModal
          goalId={goalId}
          goalTitle={goal.title}
          onClose={() => setShowSubjectsModal(false)}
          onSaved={handleSubjectsSaved}
        />
      )}

      {showEditModal && (
        <EditGoalModal goal={goal} onClose={() => setShowEditModal(false)} onSaved={handleGoalSaved} />
      )}
    </div>
  );
}

export default GoalDetail;