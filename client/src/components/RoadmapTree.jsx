import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import './RoadmapTree.css';

const STATUS_CLASS = {
  completed: 'status-complete',
  in_progress: 'status-behind',
  needs_revision: 'status-missed',
  not_started: '',
};

function RoadmapTree({ nodes, onAddChild, onToggleComplete, onSelect, selectedNodeId, onDelete, onGenerateSubject }) {
  return (
    <ul className="roadmap-tree">
      {nodes.map((node) => (
        <TreeNode
          key={node._id}
          node={node}
          onAddChild={onAddChild}
          onToggleComplete={onToggleComplete}
          onSelect={onSelect}
          selectedNodeId={selectedNodeId}
          onDelete={onDelete}
          onGenerateSubject={onGenerateSubject}
        />
      ))}
    </ul>
  );
}

function TreeNode({ node, onAddChild, onToggleComplete, onSelect, selectedNodeId, onDelete, onGenerateSubject }) {
  const hasChildren = node.children.length > 0;
  // Only top-level subjects with nothing under them offer AI generation
  const isEmptySubject = node.level === 1 && !hasChildren;

  const [expanded, setExpanded] = useState(!isEmptySubject);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');


  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddChild(node._id, newTitle.trim());
    setNewTitle('');
    setShowAddInput(false);
    setExpanded(true);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    const warning = hasChildren
      ? `Delete "${node.title}" and everything under it? This cannot be undone.`
      : `Delete "${node.title}"?`;
    if (confirm(warning)) onDelete(node._id);
  };

  

  const addLabel = node.level === 1 ? '+ chapter' : node.level === 2 ? '+ subtopic' : '+ add';

  return (
    <li className={`tree-node tree-node-level-${node.level}`}>
      <div className={`tree-node-row tree-node-row-level-${node.level} ${selectedNodeId === node._id ? 'tree-node-selected' : ''}`}>
        {hasChildren || isEmptySubject ? (
          <button type="button" className="tree-toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}

        {node.level === 1 && <span className="tree-subject-icon">📘</span>}

        {node.isActionable && (
          <button
            type="button"
            className={`tree-checkbox ${node.status === 'completed' ? 'tree-checkbox-checked check-pop' : ''}`}
            onClick={() => onToggleComplete(node)}
            title="Mark complete"
          />
        )}

        <span className="tree-node-title" onClick={() => onSelect(node)}>
          {node.title}
        </span>

        {isEmptySubject && !node.isActionable && <span className="tree-unplanned">not planned yet</span>}

        {node.isActionable && node.status !== 'not_started' && (
          <span className={`tree-node-status ${STATUS_CLASS[node.status]}`}>
            {node.status.replace('_', ' ')}
          </span>
        )}

        {node.level < 3 && (
          <button type="button" className="tree-add-btn" onClick={() => setShowAddInput((s) => !s)}>
            {addLabel}
          </button>
        )}

        <button type="button" className="tree-delete-btn" onClick={handleDeleteClick} title="Delete">🗑</button>
      </div>

      {isEmptySubject && expanded && (
        <div className="tree-generate">
          <button type="button" className="tree-generate-btn" onClick={() => onGenerateSubject(node)}>
            <Sparkles size={13} /> Generate roadmap for this subject
          </button>
        </div>
      )}

      {showAddInput && (
        <form className="tree-add-form" onSubmit={handleAddSubmit}>
          <input
            autoFocus
            className="auth-input"
            placeholder={node.level === 1 ? 'New chapter…' : 'New subtopic…'}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
        </form>
      )}

      {hasChildren && expanded && (
        <RoadmapTree
          nodes={node.children}
          onAddChild={onAddChild}
          onToggleComplete={onToggleComplete}
          onSelect={onSelect}
          selectedNodeId={selectedNodeId}
          onDelete={onDelete}
          onGenerateSubject={onGenerateSubject}
        />
      )}
    </li>
  );
}

export default RoadmapTree;