

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, CalendarPlus, RefreshCw, Pencil, CalendarDays, Clock } from 'lucide-react';
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

const findNodeById = (nodes, id) => {
  for (const node of nodes) {
    if (node._id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
};

const overloadNote = (r) =>
  r?.isOverloaded
    ? ` ⚠ This plan needs about ${formatDuration(r.requiredDailyMinutes)} a day, more than your ${formatDuration(r.dailyCapacityMinutes)} daily time.`
    : '';

function GoalDetail() {
  const navigate = useNavigate();
  const { goalId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setDrawerContext, clearDrawerContext } = useAIDrawer();

  const [goal, setGoal] = useState(null);
  const [tree, setTree] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [showScheduleSuccess, setShowScheduleSuccess] = useState(false);
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const selectedNode = tree && selectedNodeId ? findNodeById(tree, selectedNodeId) : null;

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

  const handleSyllabusSaved = (result) => {
    setShowSyllabusModal(false);
    setScheduleMessage(
      `Syllabus saved: ${result.chaptersCreated} chapters, ${result.subtopicsCreated} subtopics.` +
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
            <h1 className="text-stat" style={{ fontSize: 'var(--text-xl)' }}>{goal.title}</h1>
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

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={handleGenerateSchedule}>
            <CalendarPlus size={16} /> Generate schedule
          </button>
          <button className="btn btn-ghost" onClick={handleRegenerateSchedule}>
            <RefreshCw size={16} /> Regenerate
          </button>
          <button className="btn btn-primary" onClick={() => setShowSyllabusModal(true)}>
            <Sparkles size={16} /> AI Generate Roadmap
          </button>
        </div>
      </div>

      {scheduleMessage && (
        <div className="surface" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-sm)' }}>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>{scheduleMessage}</p>
        </div>
      )}

      <div className="goal-detail-body">
        <div className="surface roadmap-panel">
          <div className="roadmap-panel-header">
            <h3 className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Roadmap</h3>
          </div>

          {tree.length === 0 && (
            <p className="text-muted" style={{ padding: 'var(--space-4)' }}>No subjects yet — add your first one below.</p>
          )}

          <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <RoadmapTree
              nodes={tree}
              onAddChild={handleAddChild}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteNode}
              onSelect={handleSelectNode}
              selectedNodeId={selectedNodeId}
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
              <h3>{selectedNode.title}</h3>
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
                Status: {selectedNode.status.replace('_', ' ')}
              </p>
              {selectedNode.isActionable && (
                <>
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                    Estimated: {selectedNode.estimatedMinutes ?? '—'}m · Spent: {selectedNode.actualMinutesSpent}m
                  </p>
                  <SessionTimer nodeId={selectedNode._id} onSessionLogged={loadAll} />
                </>
              )}
              <FileAttachments key={selectedNode._id} nodeId={selectedNode._id} title="Files for this topic" />
            </>
          ) : (
            <p className="text-muted">Select a node to see details.</p>
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

      {showSyllabusModal && (
        <SyllabusPreviewModal
          goalId={goalId}
          onClose={() => setShowSyllabusModal(false)}
          onSaved={handleSyllabusSaved}
        />
      )}

      {showEditModal && (
        <EditGoalModal goal={goal} onClose={() => setShowEditModal(false)} onSaved={handleGoalSaved} />
      )}
    </div>
  );
}

export default GoalDetail;